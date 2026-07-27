import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const FORBIDDEN_HR_PROJECT_REF =
  ["tiorfiqi", "owylbnartegx"].join("");
const OWNER_REDIRECT_URL =
  "https://estatelignee.com/admin/invite/confirm";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizedEmail(value, name) {
  const email = value.normalize("NFKC").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${name} must be a valid email address.`);
  }
  return email;
}

function assertTarget() {
  const projectRef = required("SUPABASE_PROJECT_REF");
  const confirmedRef = required("CONFIRM_LIGNEE_PROJECT_REF");
  const url = new URL(required("SUPABASE_URL"));
  if (!/^[a-z]{20}$/.test(projectRef)) {
    throw new Error("SUPABASE_PROJECT_REF is invalid.");
  }
  if (
    projectRef === FORBIDDEN_HR_PROJECT_REF ||
    confirmedRef === FORBIDDEN_HR_PROJECT_REF
  ) {
    throw new Error("Refusing to operate on the HR Supabase project.");
  }
  if (
    confirmedRef !== projectRef ||
    url.protocol !== "https:" ||
    url.hostname !== `${projectRef}.supabase.co`
  ) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_PROJECT_REF and CONFIRM_LIGNEE_PROJECT_REF must identify the same new LIGNÉE project.",
    );
  }
  return { projectRef, url: url.toString().replace(/\/$/, "") };
}

function requestHash(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

async function findUserByEmail(client, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  throw new Error(
    "Auth user lookup exceeded the bounded bootstrap search.",
  );
}

async function ensureInvitedUser(client, owner) {
  const existing = await findUserByEmail(client, owner.email);
  if (existing) return existing;

  const { data, error } = await client.auth.admin.inviteUserByEmail(
    owner.email,
    {
      redirectTo: OWNER_REDIRECT_URL,
      data: {
        display_name: owner.displayName,
        invited_role: "owner",
        bootstrap: "initial-owner-pair",
      },
    },
  );
  if (error || !data.user) {
    throw error ?? new Error("Supabase did not return an invited user.");
  }
  return data.user;
}

async function main() {
  const target = assertTarget();
  const secretKey = required("SUPABASE_SECRET_KEY");
  const owners = [
    {
      email: normalizedEmail(
        required("LIGNEE_OWNER_ONE_EMAIL"),
        "LIGNEE_OWNER_ONE_EMAIL",
      ),
      displayName: required("LIGNEE_OWNER_ONE_DISPLAY_NAME"),
    },
    {
      email: normalizedEmail(
        required("LIGNEE_OWNER_TWO_EMAIL"),
        "LIGNEE_OWNER_TWO_EMAIL",
      ),
      displayName: required("LIGNEE_OWNER_TWO_DISPLAY_NAME"),
    },
  ];
  if (owners[0].email === owners[1].email) {
    throw new Error("The two initial Owners must use different emails.");
  }

  const client = createClient(target.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const [ownerOneUser, ownerTwoUser] = await Promise.all(
    owners.map((owner) => ensureInvitedUser(client, owner)),
  );
  if (ownerOneUser.id === ownerTwoUser.id) {
    throw new Error("Supabase resolved both Owners to the same user.");
  }

  const payload = {
    projectRef: target.projectRef,
    ownerOne: {
      userId: ownerOneUser.id,
      email: owners[0].email,
      displayName: owners[0].displayName,
    },
    ownerTwo: {
      userId: ownerTwoUser.id,
      email: owners[1].email,
      displayName: owners[1].displayName,
    },
  };
  const digest = requestHash(payload);
  const { data, error } = await client
    .schema("api")
    .rpc("bootstrap_initial_owners", {
      p_owner_one_user_id: payload.ownerOne.userId,
      p_owner_one_email: payload.ownerOne.email,
      p_owner_one_display_name: payload.ownerOne.displayName,
      p_owner_two_user_id: payload.ownerTwo.userId,
      p_owner_two_email: payload.ownerTwo.email,
      p_owner_two_display_name: payload.ownerTwo.displayName,
      p_idempotency_key: `initial-owners-${digest}`,
      p_request_hash: digest,
    });
  if (error) throw error;
  const result = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (
    !result ||
    typeof result !== "object" ||
    !Array.isArray(result.owners) ||
    result.owners.length !== 2
  ) {
    throw new Error(
      "Initial Owner bootstrap returned an invalid response.",
    );
  }
  console.log(
    `Initial Owners ready in ${target.projectRef}: ${owners
      .map(({ email }) => maskEmail(email))
      .join(", ")}.`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Initial Owner bootstrap failed.",
  );
  process.exitCode = 1;
});
