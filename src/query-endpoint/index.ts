import { defineEndpoint } from "@directus/extensions-sdk";
import SqlString from "sqlstring";

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

      const progressInterval = Math.max(1, Math.floor(totalQueries / 100)); // Limit to ~100 dots max
      let progressDots = "";

      let data = null;
      const decodeSpecialMarkers = (text: string) =>
        text.replace(/\[SEMICOLON\]/g, ";");

      const escapeStringLiterals = (query: string): string => {
        return query.replace(/'([^']*)'/g, (match, p1) => {
          const unescapedString = p1.replace(/\\n/g, '\n');
          return SqlString.escape(unescapedString);
        });
      };

      console.log('Executing ', totalQueries, 'queries...');
      for (let i = 0; i < totalQueries; i++) {
        let decodedQuery = decodeSpecialMarkers(queries[i]);
        decodedQuery = escapeStringLiterals(decodedQuery);

        try {
          data = await database.raw(decodedQuery, parameters || {});
        } catch (e: any) {
          if (!e.message.match(/SQLITE_CONSTRAINT: UNIQUE constraint failed:.*id$/)) {
            console.error(`\n[ERROR] Query failed:\n${decodedQuery}\n${e.message}\n`);
          }
        }

        // Update progress bar every 'progressInterval' queries

        if ((i + 1) % progressInterval === 0) {
          progressDots += "."; // Add a dot
          process.stdout.write('\x1b[0G'); // Move cursor to start
          process.stdout.write(progressDots); // Overwrite
          process.stdout.write(''); // Try to force flush
        }
      }

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
