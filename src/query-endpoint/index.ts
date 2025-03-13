import { defineEndpoint } from "@directus/extensions-sdk";
import SqlString from "sqlstring";
import { exec } from "child_process";
import { promisify } from "util";

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

    try {
      // Execute the query
      const { query: querySet, parameters } = req.body;
      if (!querySet) throw new Error("No query specified");

      const queries = querySet.trim().split(";\n");
      const totalQueries = queries.length;
      console.log(`Executing ${totalQueries} queries...`);

      let data = null;
      const decodeSpecialMarkers = (text: string) =>
        text.replace(/\[SEMICOLON\]/g, ";");

      const escapeStringLiterals = (query: string): string => {
        return query.replace(/'([^']*)'/g, (match, p1) => {
          const unescapedString = p1.replace(/\\n/g, '\n');
          return SqlString.escape(unescapedString);
        });
      };

      // Knex is too slow for bulk deletes, so we use the SQLite CLI
      const deleteViaCli = async (deleteCommand: string): Promise<void> =>{
        const dbPath = '/directus/persist/database/eventus.sqlite';
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
      }

      console.log('Executing ', totalQueries, 'queries...');
      
      await database.transaction(async (trx) => {
        for (let i = 0; i < totalQueries; i++) {
          let decodedQuery = decodeSpecialMarkers(queries[i]);
          decodedQuery = escapeStringLiterals(decodedQuery);
          try {
            if (decodedQuery.toLowerCase().startsWith("delete from ")) {
              data = await deleteViaCli(decodedQuery);
            } else {
              data = await trx.raw(decodedQuery, parameters || {});
            }
          } catch (e: any) {
            if (!e.message.match(/SQLITE_CONSTRAINT: UNIQUE constraint failed:.*id$/)) {
              console.error(`\n[ERROR] Query failed:\n${decodedQuery}\n${e.message}\n`);
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
