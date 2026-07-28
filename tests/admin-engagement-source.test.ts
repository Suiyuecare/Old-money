import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("appointment and newsletter admin source contracts", () => {
  it("uses retry-stable keys that rotate only after durable success", () => {
    const appointments = readFileSync(
      resolve(
        process.cwd(),
        "components/admin/AdminAppointmentsWorkspace.tsx",
      ),
      "utf8",
    );
    const newsletter = readFileSync(
      resolve(
        process.cwd(),
        "components/admin/AdminNewsletterWorkspace.tsx",
      ),
      "utf8",
    );

    expect(
      appointments.match(/useAdminIdempotencyKey\(/g),
    ).toHaveLength(1);
    expect(
      newsletter.match(/useAdminIdempotencyKey\(/g),
    ).toHaveLength(3);
    expect(appointments).not.toContain("useState(");
    expect(newsletter).not.toContain("useState(");
  });
});
