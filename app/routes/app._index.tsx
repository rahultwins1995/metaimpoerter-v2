import { useFetcher } from "react-router";
import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  LinksFunction,
} from "react-router";
import { parse } from "csv-parse/sync";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import styles from "../styles/import-metafields.css?url";

/* -------------------------------- CSS -------------------------------- */

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: styles },
];

/* ------------------------------ CSV Shape ------------------------------ */

interface CSVRow {
  Name?: string;
  Key?: string;
  Type?: string;
  Description?: string;
}

/* ------------------------------- Loader ------------------------------- */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

/* ------------------------------- Action ------------------------------- */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const csv = formData.get("file") as File | null;

  if (!csv) {
    return {
      status: "error",
      log: ["❌ No file uploaded"],
    };
  }

  const buffer = Buffer.from(await csv.arrayBuffer());
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
  }) as CSVRow[];

  if (!rows.length) {
    return {
      status: "error",
      log: ["❌ CSV file is empty"],
    };
  }

  const requiredHeaders = ["Name", "Key", "Type"];
  const headers = Object.keys(rows[0] || {});
  const missingHeaders = requiredHeaders.filter(
    (h) => !headers.includes(h)
  );

  if (missingHeaders.length > 0) {
    return {
      status: "error",
      log: [
        "❌ Invalid CSV format.",
        "Required columns:",
        "Name, Key, Type, Description",
      ],
    };
  }

  const esc = (v: string) =>
    v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const finalLog: string[] = [];

  for (const row of rows) {
    const name = row.Name?.trim();
    const key = row.Key?.trim();
    const type = row.Type?.trim();
    const description = row.Description?.trim() || "";

    if (!name || !key || !type) {
      finalLog.push("⚠️ Skipped row — missing name/key/type");
      continue;
    }

    const mutation = `
      mutation {
        metafieldDefinitionCreate(
          definition: {
            name: "${esc(name)}"
            namespace: "custom"
            key: "${esc(key)}"
            type: "${esc(type)}"
            description: "${esc(description)}"
            ownerType: PRODUCT
          }
        ) {
          createdDefinition { id name key }
          userErrors { message }
        }
      }
    `;

    try {
      const resp = await admin.graphql(mutation);
      const json = await resp.json();

      const created =
        json.data?.metafieldDefinitionCreate?.createdDefinition;
      const errors =
        json.data?.metafieldDefinitionCreate?.userErrors;

      if (created) {
        finalLog.push(`✅ Created metafield: ${name} (${key})`);
      } else if (errors?.length) {
        finalLog.push(
          `⚠️ ${name} → ${errors.map((e: any) => e.message).join(", ")}`
        );
      } else {
        finalLog.push(`⚠️ Unknown response for ${name}`);
      }
    } catch (err: any) {
      finalLog.push(`❌ Failed for ${name} → ${err.message}`);
    }
  }

  return { status: "success", log: finalLog };
};

/* ------------------------------- Component ------------------------------- */

export default function ImportMetafieldsPage() {
  const fetcher = useFetcher<{
    status?: "error" | "success";
    log?: string[];
  }>();
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubmitting =
    fetcher.state === "loading" || fetcher.state === "submitting";

  // ✅ Reset file after submit (success OR error)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setFileName("");
      setError("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="main">
      <h2>Adam’s metafield importer</h2>

      <div>
        <h3>Install metafields to enable advanced theme features.</h3>
        <div className="japanese-text">
          高度なテーマ機能を有効にするには、メタフィールドをインストールします
        </div>
      </div>

      <fetcher.Form
        method="post"
        encType="multipart/form-data"
        onSubmit={(e) => {
          if (!fileName) {
            e.preventDefault();
            setError("Please upload a CSV file.");
          } else if (!fileName.toLowerCase().endsWith(".csv")) {
            e.preventDefault();
            setError("Only .csv files are allowed.");
          } else {
            setError("");
          }
        }}
      >

        <a
          href="/sample-metafield-definitions.csv"
          target="_blank"
          rel="noopener"
          className="upload-btn btn-secondary"

        >
          Download sample CSV
        </a>

        <div className="upload-btn-wrapper">



          <div className="upload-btn">
            Upload .csv
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setFileName(file?.name ?? "");
                setError(""); // ✅ clear error on select
              }}
            />
          </div>
          {fileName && <p>Selected: {fileName}</p>}
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>




        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Installing..." : "Install"}
        </button>





      </fetcher.Form>
      {fetcher.data?.log && (
        <div
          className={`import_results_box ${fetcher.data.status === "error"
            ? "import_results_error"
            : "import_results_success"
            }`}
          style={{ marginTop: 20 }}
        >
          <h3>Import Results</h3>
          {fetcher.data.log.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      <ul>
        <li>
          <a href="https://adamstitan.notion.site" target="_blank">
            Metafields explained
          </a>
        </li>
        <li>
          <a href="https://adamstitan.notion.site" target="_blank">
            Setup guide
          </a>
        </li>
        <li>
          <a href="https://adamstheme.com" target="_blank">
            Demo store 1
          </a>
        </li>
      </ul>
    </div>
  );
}

/* ------------------------------- Headers ------------------------------- */

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
