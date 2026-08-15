import test from "node:test";
import assert from "node:assert/strict";

import { extractStatuses } from "../src/lib/whatsapp/webhooks/statuses.ts";

test("extrae el error de Meta de un status fallido", () => {
  const [status] = extractStatuses({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                {
                  id: "wamid.synthetic",
                  status: "failed",
                  recipient_id: "5210000000000",
                  timestamp: "1780000000",
                  errors: [
                    {
                      code: 131026,
                      error_subcode: 2494003,
                      type: "OAuthException",
                      title: "Message undeliverable",
                      message: "Message undeliverable",
                      error_data: { details: "Synthetic delivery failure" },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(status.status, "failed");
  assert.equal(status.error?.code, 131026);
  assert.equal(status.error?.subcode, 2494003);
  assert.equal(status.error?.details, "Synthetic delivery failure");
});

test("payload incompleto no rompe el webhook parser", () => {
  assert.deepEqual(extractStatuses({ entry: [{ changes: [{ value: {} }] }] }), []);
  assert.deepEqual(extractStatuses(null), []);
});
