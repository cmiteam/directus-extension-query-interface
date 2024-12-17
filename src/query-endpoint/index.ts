import { defineEndpoint } from "@directus/extensions-sdk";

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
      let data = null;
      const decodeSpecialMarkers = (text: string) =>
        text.replace(/\[SEMICOLON\]/g, ";").replace(/\[NEWLINE\]/g, "\n");
      
      for (const query of queries) {
        let decodedQuery = decodeSpecialMarkers(query);
        try {
          data = await database.raw (decodedQuery, parameters || {}); 
        }
        catch (e: any) {
          if (!e.message.match(/SQLITE_CONSTRAINT: UNIQUE constraint failed:.*id$/)) {
            console.error({level: "error", message: "Query failed", query: decodedQuery, error: e.message })
          }
        }
      }

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
