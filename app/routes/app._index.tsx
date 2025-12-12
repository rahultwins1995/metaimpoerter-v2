import { useFetcher } from "react-router";
import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { parse } from "csv-parse/sync";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";




/** Shape of each CSV row */
interface CSVRow {
  Name?: string;
  Key?: string;
  Type?: string;
  Description?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

/** Server side */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const csv = formData.get("file") as File | null;

  if (!csv) {
    return { log: ["❌ No file uploaded"] };
  }

  const buffer = Buffer.from(await csv.arrayBuffer());
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
  }) as CSVRow[];



  const requiredHeaders = ["Name", "Key", "Type"];

  const headers = Object.keys(rows[0] || {});
  const missingHeaders = requiredHeaders.filter(
    (h) => !headers.includes(h)
  );

  if (missingHeaders.length > 0) {
    return {
      log: [
        "❌ Invalid CSV format.",
        "This app only accepts a Metafield Definitions CSV.",
        "Required columns:",
        "Name, Key, Type, Description",
        "",
        "",
        "",
      ],
    };
  }

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
            name: "${name}"
            namespace: "custom"
            key: "${key}"
            type: "${type}"
            description: "${description}"
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

      const created = json.data.metafieldDefinitionCreate.createdDefinition;
      const errors = json.data.metafieldDefinitionCreate.userErrors;

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

  return { log: finalLog };
};


export default function ImportMetafieldsPage() {
  const fetcher = useFetcher<{ log?: string[] }>();
  const [fileName, setFileName] = useState("");
  const [clientError, setClientError] = useState("");

  const isSubmitting =
    fetcher.state === "loading" || fetcher.state === "submitting";

  return (
    <s-page heading="Import Product Metafields from CSV">
      <fetcher.Form
        method="post"
        encType="multipart/form-data"
        onSubmit={(e) => {
          if (!fileName) {
            e.preventDefault();
            setClientError("Please select a CSV file before uploading.");
          } else if (!fileName.toLowerCase().endsWith(".csv")) {
            e.preventDefault();
            setClientError("Only .csv files are allowed.");
          } else {
            setClientError("");
          }
        }}
      >
        <s-stack direction="block" gap="base">
          <input
            type="file"
            name="file"
            accept=".csv"
            onChange={(e) =>
              setFileName(e.target.files?.[0]?.name ?? "")
            }
            style={{ marginBottom: "6px" }}
          />

          <s-text tone="subdued">
            <s-link
              href="/sample-metafield-definitions.csv"
              target="_blank"
              rel="noopener"
            >
              Download a sample CSV file.
            </s-link>
          </s-text>

          {fileName && <s-text>Selected: {fileName}</s-text>}

          {clientError && (
            <s-badge tone="critical">{clientError}</s-badge>
          )}

          <s-button type="submit" {...(isSubmitting ? { loading: true } : {})}>
            Upload &amp; Create Metafields
          </s-button>
        </s-stack>

      </fetcher.Form>

      {fetcher.data?.log && (
        <s-section heading="Import Results">
          {fetcher.data.log.map((entry, index) => (
            <s-paragraph key={index}>{entry}</s-paragraph>
          ))}
        </s-section>
      )}
    </s-page>
  );
}


export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
