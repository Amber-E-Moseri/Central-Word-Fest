import { describe, expect, it } from "vitest";

// Copied from public/pcdl/app.js
function normalizeRole(role: any) {
  const map: Record<string, string> = {
    member: "Member",
    bsc: "Bible Study Class Teacher",
    leader: "Cell Leader",
    coordinator: "Coordinator",
    pastor: "Pastor",
    subgroup_pastor: "Subgroup Pastor",
    group_pastor: "Group Pastor",
    admin: "Admin",
    "Bible Study Class Teacher": "Bible Study Class Teacher",
    "Cell Leader": "Cell Leader",
    "Coordinator": "Coordinator",
    "Pastor": "Pastor",
    "Subgroup Pastor": "Subgroup Pastor",
    "Group Pastor": "Group Pastor",
    "Admin": "Admin",
    "Member": "Member"
  };
  return map[role] || role || "Member";
}

// Copied from public/pcdl/app.js
function cap(s: any) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// Copied from public/pcdl/app.js
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// Copied from public/pcdl/app.js
function isAdminRole(role: any) {
  return normalizeRole(role) === "Admin";
}

// Copied from public/pcdl/app.js
function isGroupPastorRole(role: any) {
  return normalizeRole(role) === "Group Pastor";
}

// Copied from public/pcdl/app.js
function canAccessMemberExperience(role: any) {
  return !isAdminRole(role) && !isGroupPastorRole(role);
}

// Copied from public/pcdl/auth.js
function hasInvalidSupabaseConfig(config: any) {
  const url = String(config?.SUPABASE_URL || "").trim();
  const key = String(config?.SUPABASE_ANON_KEY || "").trim();
  const invalidUrl = !url || url.includes("YOUR_PROJECT_REF");
  const invalidKey = !key || key.includes("YOUR_SUPABASE_ANON_KEY");
  return invalidUrl || invalidKey;
}

// Copied from public/pcdl/auth.js
function parseSupabaseProjectRef(url: string) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || null;
  } catch {
    return null;
  }
}

describe("normalizeRole", () => {
  it("maps known roles", () => {
    expect(normalizeRole("admin")).toBe("Admin");
    expect(normalizeRole("coordinator")).toBe("Coordinator");
  });

  it("returns unknown value unchanged, with null/empty fallback", () => {
    expect(normalizeRole("SomeRole")).toBe("SomeRole");
    expect(normalizeRole("")).toBe("Member");
    expect(normalizeRole(null)).toBe("Member");
  });
});

describe("cap", () => {
  it("capitalizes first character", () => {
    expect(cap("hello")).toBe("Hello");
    expect(cap("Hello")).toBe("Hello");
    expect(cap("a")).toBe("A");
  });

  it("handles empty input", () => {
    expect(cap("")).toBe("");
  });
});

describe("initials", () => {
  it("extracts initials", () => {
    expect(initials("Grace Adebayo")).toBe("GA");
    expect(initials("Amber")).toBe("A");
    expect(initials("John Mark Doe")).toBe("JM");
  });

  it("handles empty string per current implementation", () => {
    expect(initials("")).toBe("");
  });
});

describe("canAccessMemberExperience", () => {
  it("returns expected role access", () => {
    expect(canAccessMemberExperience("Member")).toBe(true);
    expect(canAccessMemberExperience("Admin")).toBe(false);
    expect(canAccessMemberExperience("Coordinator")).toBe(true);
    expect(canAccessMemberExperience("Group Pastor")).toBe(false);
  });
});

describe("isAdminRole", () => {
  it("returns admin-only access", () => {
    expect(isAdminRole("Admin")).toBe(true);
    expect(isAdminRole("Member")).toBe(false);
    expect(isAdminRole("Group Pastor")).toBe(false);
  });
});

describe("hasInvalidSupabaseConfig", () => {
  it("flags missing/placeholder configs", () => {
    expect(hasInvalidSupabaseConfig(null)).toBe(true);
    expect(hasInvalidSupabaseConfig({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "" })).toBe(true);
    expect(
      hasInvalidSupabaseConfig({
        SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
        SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
      })
    ).toBe(true);
  });

  it("accepts real-looking config", () => {
    expect(
      hasInvalidSupabaseConfig({
        SUPABASE_URL: "https://abcdef.supabase.co",
        SUPABASE_ANON_KEY: "eyJ.real.key"
      })
    ).toBe(false);
  });
});

describe("parseSupabaseProjectRef", () => {
  it("extracts project ref from URL", () => {
    expect(parseSupabaseProjectRef("https://abcdef.supabase.co")).toBe("abcdef");
  });

  it("returns null for invalid input", () => {
    expect(parseSupabaseProjectRef("")).toBe(null);
    expect(parseSupabaseProjectRef("not-a-url")).toBe(null);
  });
});

