(() => {
  async function getVisiblePeople() {
    try {
      const { data, error } = await PCDL.supabase
        .from("profiles")
        .select("id, full_name, email, role, fellowship:fellowships(name)")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id,
        name: p.full_name || p.email,
        full_name: p.full_name || p.email,
        email: p.email,
        role: normalizeRole(p.role),
        fellowship: p.fellowship?.name || "No fellowship",
        ini: initials(p.full_name || p.email || "U")
      }));
    } catch (err) {
      console.warn("Could not load people:", err.message);
      return [];
    }
  }

  async function getLiveCommunityReflections() {
    try {
      return await PCDL.getCommunityReflections();
    } catch (err) {
      console.warn("Could not load community reflections:", err.message);
      return [];
    }
  }

  async function renderPeopleList(containerSelector) {
    const people = await getVisiblePeople();
    const rows = people
      .map((user) => clickablePersonRow(user, `<span class="badge badge-purple">${user.role}</span>`))
      .join("");
    const target =
      typeof containerSelector === "string"
        ? document.querySelector(containerSelector)
        : containerSelector;
    if (target) target.innerHTML = rows || `<div class="notice">No people found yet.</div>`;
  }

  async function renderLiveReflections() {
    const target = document.getElementById("live-reflections-list");
    if (!target) return;
    const reflections = await getLiveCommunityReflections();
    target.innerHTML =
      reflections
        .map(
          (r) => `
      <div class="member-row">
        <div class="avatar">${initials(r.profiles?.full_name || "U")}</div>
        <div class="member-info">
          <div class="member-name">${r.profiles?.full_name || "User"} <span class="badge badge-purple" style="margin-left:6px">${r.visibility}</span></div>
          <div class="member-sub">${r.profiles?.fellowships?.name || ""} · ${r.profiles?.role || ""}</div>
          <div style="font-size:13px;line-height:1.6;margin-top:8px;color:var(--text)">${r.reflection_text}</div>
        </div>
      </div>`
        )
        .join("") || `<div class="notice">No shared reflections yet.</div>`;
  }

  async function submitReflectionFromCommunity() {
    try {
      const text = document.getElementById("reflection-text")?.value || "";
      const visibility = document.getElementById("reflection-visibility")?.value || "private";
      await PCDL.saveReflection(null, text, visibility);
      alert("Reflection saved.");
      renderLiveReflections();
    } catch (err) {
      alert(err.message);
    }
  }

  // Override fellowship page to use live data.
  window.pageFellowship = function pageFellowship(m) {
    m.style.gridTemplateColumns = "";
    m.innerHTML = `
      <div class="circle-pane">
        <div class="card" style="grid-column:1/-1">
          <div class="card-title">People <span class="badge badge-purple">${S.user?.fellowship || ""}</span></div>
          <div class="notice">Live people list. Coordinators, Pastors, Subgroup Pastors, and Group Pastors can click people within their permission scope to view progress and shared reflections.</div>
        </div>
        <div class="card" style="grid-column:1/-1">
          <div class="card-title">Members</div>
          <div id="live-people-list"><div class="notice">Loading people...</div></div>
        </div>
      </div>`;
    renderPeopleList("#live-people-list");
  };

  // Override community page to use live reflections.
  window.pageCommunity = function pageCommunity(m) {
    m.style.gridTemplateColumns = "";
    m.innerHTML = `
      <div class="card" style="background:linear-gradient(135deg,var(--purple),var(--purple-dark));color:#fff;border:none">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <div style="font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px">Community Reflections</div>
            <div style="font-size:20px;font-weight:900">Shared responses from today's message</div>
          </div>
          <span style="background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:900">Optional sharing</span>
        </div>
      </div>
      <div class="circle-pane">
        <div class="card">
          <div class="card-title">Share a reflection</div>
          <textarea id="reflection-text" style="width:100%;border:1px solid var(--line);border-radius:12px;padding:12px;font-family:inherit;font-size:13px;min-height:120px;background:#FFFCF6;resize:vertical;color:var(--text)" placeholder="Share what ministered to you today..."></textarea>
          <div class="form-group" style="margin-top:10px">
            <label>Who can see this?</label>
            <select id="reflection-visibility">
              <option value="private">Private</option>
              <option value="circle">My Accountability Circle</option>
              <option value="fellowship">My Fellowship</option>
              <option value="everyone">Everyone</option>
            </select>
          </div>
          <button class="btn btn-purple btn-full" style="margin-top:12px" onclick="submitReflectionFromCommunity()">Post reflection</button>
        </div>
        <div class="card">
          <div class="card-title">Community guidelines</div>
          <div class="notice">Reflections are for encouragement, testimony, and building consistency. Sharing is optional; private reflections remain private.</div>
        </div>
        <div class="card" style="grid-column:1/-1">
          <div class="card-title">Shared reflections</div>
          <div id="live-reflections-list"><div class="notice">Loading reflections...</div></div>
        </div>
      </div>`;
    renderLiveReflections();
  };

  window.getVisiblePeople = getVisiblePeople;
  window.getLiveCommunityReflections = getLiveCommunityReflections;
  window.renderPeopleList = renderPeopleList;
  window.renderLiveReflections = renderLiveReflections;
  window.submitReflectionFromCommunity = submitReflectionFromCommunity;
})();
