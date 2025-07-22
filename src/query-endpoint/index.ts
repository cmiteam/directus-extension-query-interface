import { defineEndpoint } from "@directus/extensions-sdk";
import SqlString from "sqlstring";
import { exec } from "child_process";
import { promisify } from "util";
import zlib from "zlib";

const execAsync = promisify(exec);

export default defineEndpoint((router, { database }) => {
  router.post("/", async (req, res) => {
    // Do not allow the user to execute queries unless they are an admin or have CRUD permissions on the query table.
    let mayProceed = req?.accountability?.admin || false;

    if (!mayProceed && req?.accountability?.permissions) {
      const permissions = req?.accountability?.permissions;

      const mayCreate = permissions.some(
        (p) => p.collection === "query" && p.action === "create"
      );
      const mayRead = permissions.some(
        (p) => p.collection === "query" && p.action === "read"
      );

      const mayUpdate = permissions.some(
        (p) => p.collection === "query" && p.action === "update"
      );

      const mayDelete = permissions.some(
        (p) => p.collection === "query" && p.action === "delete"
      );

      mayProceed = mayCreate && mayRead && mayUpdate && mayDelete;
    }

    if (!mayProceed) throw new Error("Permission denied");

    function decompressQuery(base64: string): string {
      const buffer = Buffer.from(base64, "base64");
      const result = zlib.inflateSync(buffer).toString("utf-8");
      return result;
    }

    try {
      // Execute the query
      const { query: compressedQuery, parameters } = req.body;
      if (!compressedQuery) throw new Error("No compressedQuery specified");

      const querySet = decompressQuery(compressedQuery);
      const queries: string[] = querySet.trim().split(";\n");
      const totalQueries = queries.length;
      console.log(`Executing ${totalQueries} queries...`);

      let data = null;
      const decodeSpecialMarkers = (text: string) =>
        text.replace(/\[SEMICOLON\]/g, ";");

      const escapeStringLiterals = (query: string): string => {
        return query.replace(/'([^']*)'/g, (match, p1) => {
          // Skip JSON-like strings; they’ll be handled as parameters
          if (p1.match(/^\[.*\]$/s) || p1.match(/^\{.*\}$/s)) {
            return match; // Preserve JSON string unchanged
          }
          return SqlString.escape(p1); // Escape non-JSON strings
        });
      };
      // Knex is too slow for bulk deletes, so we use the SQLite CLI
      const deleteViaCli = async (deleteCommand: string): Promise<void> => {
        const dbPath = "/directus/persist/database/events.sqlite";
        const command = `sqlite3 ${dbPath} "${deleteCommand}"`;

        try {
          const { stdout, stderr } = await execAsync(command);
          if (stderr) {
            console.error(`[CLI ERROR] ${stderr}`);
          }
          console.log(`[CLI OUTPUT] ${stdout}`);
        } catch (err: any) {
          console.error(`[CLI FAILED]`, err.message);
        }
      };

      console.log("Executing ", totalQueries, "queries...");

      await database.transaction(async (trx) => {
        for (let i = 0; i < totalQueries; i++) {
          let decodedQuery = decodeSpecialMarkers(queries[i]);
          decodedQuery = escapeStringLiterals(decodedQuery);
          try {
            if (decodedQuery.toLowerCase().startsWith("delete from ")) {
              data = await deleteViaCli(decodedQuery);
            } else {
              // Find all JSON strings in the query
              const jsonMatches = decodedQuery.matchAll(/'(\[.*?\]|\{.*?\})'/gs);
              const jsonParams = [];
              let modifiedQuery = decodedQuery;

              // Replace JSON strings with placeholders
              for (const match of jsonMatches) {
                const jsonString = match[1];
                jsonParams.push(jsonString);
                modifiedQuery = modifiedQuery.replace(match[0], '?');
              }

              if (jsonParams.length > 0) {
                data = await trx.raw(modifiedQuery, jsonParams);
              } else {
                modifiedQuery = escapeStringLiterals(decodedQuery);
                data = await trx.raw(modifiedQuery, parameters || {});
              }
            }
          } catch (e: any) {
            if (e.code === "SQLITE_MISUSE"){
              console.log(e.message.replace(/( - )?SQLITE_MISUSE: not an error/g, ""));
            } else if (
              !e.message.match(
                /SQLITE_CONSTRAINT: UNIQUE constraint failed:.*id$/
              )
            ) {
              console.error(
                `\n[ERROR] Query failed:\n${decodedQuery}\n${e.message}\n`
              );
            }
          }
        }
      });

      console.log("\nExecution completed."); // Final message

      res.setHeader("Content-Type", "application/json");
      res.status(200);
      res.end(JSON.stringify({ data }));
    } catch (e: any) {
      res.setHeader("Content-Type", "application/json");
      res.status(400);
      res.end(
        JSON.stringify({
          error: { message: e.message, extensions: { code: "Bad Request" } },
        })
      );
    }
  });
});
