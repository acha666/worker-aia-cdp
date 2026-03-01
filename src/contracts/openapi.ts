import { generateOpenApi } from "@ts-rest/open-api";
import { apiContract } from "./api";

const openApiVersion = "3.0.3";

interface RequestBody {
  required: boolean;
  description: string;
  content: Record<string, { schema: unknown }>;
}

function mapOperation<T extends { requestBody?: unknown }>(
  operation: T,
  appRoute: { path: string; method: string }
): T {
  if (appRoute.method === "POST" && appRoute.path === "/api/v2/crls") {
    const requestBody: RequestBody = {
      required: true,
      description: "Upload a CRL file in DER or PEM format as multipart form-data",
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["crl"],
            properties: {
              crl: {
                type: "string",
                format: "binary",
                description: "CRL file (.crl, .der, or .pem)",
              },
            },
          },
        },
      },
    };

    return {
      ...operation,
      requestBody,
    } as T;
  }

  return operation;
}

export const openApiDocument = generateOpenApi(
  apiContract,
  {
    openapi: openApiVersion,
    info: {
      title: "PKI AIA/CDP Worker API",
      version: "2.0.0",
      description:
        "OpenAPI specification generated from the ts-rest contract and Zod schemas. Worker implementation is authoritative.",
    },
    servers: [
      {
        url: "/",
        description: "Relative base URL",
      },
    ],
    tags: [
      { name: "certificates", description: "Certificate listing and detail operations" },
      { name: "crls", description: "CRL listing, detail, and upload operations" },
      { name: "stats", description: "Service statistics" },
      { name: "health", description: "Service health checks" },
    ],
  },
  {
    setOperationId: "concatenated-path",
    operationMapper: (operation, appRoute) => {
      const mapped = mapOperation(operation, appRoute);
      const path = appRoute.path;

      if (path.startsWith("/api/v2/certificates")) {
        mapped.tags = ["certificates"];
      } else if (path.startsWith("/api/v2/crls")) {
        mapped.tags = ["crls"];
      } else if (path.startsWith("/api/v2/stats")) {
        mapped.tags = ["stats"];
      } else if (path.startsWith("/api/v2/health")) {
        mapped.tags = ["health"];
      }

      return mapped;
    },
  }
);
