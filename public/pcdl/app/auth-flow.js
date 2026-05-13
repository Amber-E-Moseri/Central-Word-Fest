(() => {
  let fellowshipOptionsCache = null;
  let fellowshipOptionsLoading = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function readTrimmed(id) {
    return byId(id)?.value?.trim() || "";
  }

  function showAuthMessage(message, isError = true) {
    const node = byId("auth-message");
    if (!node) {
      alert(message);
      return;
    }
    node.textContent = message;
    node.style.display = "block";
    node.style.color = isError ? "#8B1E1E" : "#1F4F2D";
    node.style.background = isError ? "#FDECEC" : "#EAF7EE";
    node.style.border = isError ? "1px solid #F6CACA" : "1px solid #BFE3C8";
  }

  function clearAuthMessage() {
    const node = byId("auth-message");
    if (!node) return;
    node.textContent = "";
    node.style.display = "none";
  }

  async function loadFellowshipOptions() {
    const select = byId("auth-fellowship");
    if (!select) return;

    if (fellowshipOptionsCache) {
      select.innerHTML =
        `<option value="">Choose your fellowship</option>` +
        fellowshipOptionsCache.map((f) => `<option>${f.name}</option>`).join("");
      return;
    }

    if (fellowshipOptionsLoading) {
      await fellowshipOptionsLoading;
      return;
    }

    select.innerHTML = `<option value="">Loading fellowships…</option>`;

    fellowshipOptionsLoading = (async () => {
      const { data, error } = await PCDL.supabase
        .from("fellowships")
        .select("id, name")
        .order("name");
      if (error) throw error;
      fellowshipOptionsCache = data || [];
      select.innerHTML =
        `<option value="">Choose your fellowship</option>` +
        fellowshipOptionsCache.map((f) => `<option>${f.name}</option>`).join("");
    })();

    try {
      await fellowshipOptionsLoading;
    } catch (err) {
      select.innerHTML = `<option value="">Could not load fellowships</option>`;
      showAuthMessage(err.message || "Could not load fellowships.", true);
    } finally {
      fellowshipOptionsLoading = null;
    }
  }

  async function hydrateSupabaseUser() {
    try {
      let profile = await PCDL.getMyProfile();
      if (!profile) return false;

      const savedFellowship = localStorage.getItem("pcdl_selected_fellowship");
      if (!profile.fellowship_id && savedFellowship) {
        const { data: fellowshipRow } = await PCDL.supabase
          .from("fellowships")
          .select("id, name")
          .eq("name", savedFellowship)
          .maybeSingle();

        if (fellowshipRow?.id) {
          await PCDL.supabase
            .from("profiles")
            .update({ fellowship_id: fellowshipRow.id })
            .eq("id", profile.id);
          profile = await PCDL.getMyProfile();
        }
      }

      S.user = {
        name: profile.full_name || profile.email,
        email: profile.email,
        role: normalizeRole(profile.role),
        fellowship: profile.fellowship?.name || savedFellowship || "No fellowship",
        fellowship_id: profile.fellowship_id,
        partners: []
      };

      S.page = "home";
      render();
      return true;
    } catch (err) {
      console.warn("Could not hydrate Supabase user:", err.message);
      return false;
    }
  }

  async function hydrateSessionFallbackUser() {
    try {
      const session = await PCDL.getSession();
      const user = session?.user;
      if (!user) return false;

      const metaName = user.user_metadata?.full_name || user.email || "User";
      const savedFellowship = localStorage.getItem("pcdl_selected_fellowship") || "No fellowship";

      S.user = {
        name: metaName,
        email: user.email,
        role: "Member",
        fellowship: savedFellowship,
        fellowship_id: null,
        partners: []
      };
      S.page = "home";
      render();
      return true;
    } catch (err) {
      console.warn("Could not hydrate fallback session user:", err.message);
      return false;
    }
  }

  async function handleSupabaseLogin() {
    try {
      clearAuthMessage();
      const email = readTrimmed("auth-email");
      const password = byId("auth-password")?.value || "";
      if (!email || !password) {
        showAuthMessage("Enter email and password to sign in.");
        return;
      }
      await PCDL.signIn(email, password);
      const loaded = await hydrateSupabaseUser();
      if (!loaded) {
        const fallbackLoaded = await hydrateSessionFallbackUser();
        if (fallbackLoaded) {
          showAuthMessage("Signed in. Profile is still syncing; some fields may update shortly.", false);
          return;
        }
        showAuthMessage("Signed in, but profile could not be loaded.", true);
      }
    } catch (err) {
      showAuthMessage(err.message || "Sign in failed.");
    }
  }

  async function handleSupabaseSignup() {
    try {
      clearAuthMessage();
      const fullName = readTrimmed("auth-full-name");
      const email = readTrimmed("auth-email");
      const password = byId("auth-password")?.value || "";
      const selectedFellowship = byId("auth-fellowship")?.value || "";
      const selectedRole = "Member";

      if (!fullName || !email || !password || !selectedFellowship) {
        showAuthMessage("Enter full name, email, password, and fellowship.");
        return;
      }

      const { data: fellowshipRow, error: fellowshipError } = await PCDL.supabase
        .from("fellowships")
        .select("id, name")
        .eq("name", selectedFellowship)
        .maybeSingle();
      if (fellowshipError) throw fellowshipError;
      if (!fellowshipRow?.id) {
        showAuthMessage("Selected fellowship is unavailable. Refresh and try again.");
        return;
      }

      localStorage.setItem("pcdl_selected_fellowship", selectedFellowship);
      const result = await PCDL.signUp(email, password, fullName);
      const userId = result?.user?.id || result?.data?.user?.id;

      if (userId) {
        await PCDL.updateMyProfileForSignup(userId, {
          role: selectedRole,
          full_name: fullName,
          fellowship_id: fellowshipRow.id,
          is_active: true
        });
      }

      showAuthMessage("Account created. Sign in now or after email confirmation.", false);
    } catch (err) {
      showAuthMessage(err.message || "Sign up failed.");
    }
  }

  async function handleForgotPassword() {
    try {
      clearAuthMessage();
      const email = readTrimmed("auth-email");
      if (!email) {
        showAuthMessage("Enter your email first, then click Forgot password.");
        return;
      }
      await PCDL.requestPasswordReset(email);
      showAuthMessage("Password reset email sent. Check your inbox.", false);
    } catch (err) {
      showAuthMessage(err.message || "Could not send reset email.");
    }
  }

  async function handleSupabaseLogout() {
    await PCDL.signOut();
  }

  function renderSignup() {
    const main = typeof el === "function" ? el("main-content") : byId("main-content");
    if (!main) return;
    main.style.gridTemplateColumns = "";
    main.innerHTML = `
      <div class="two-pane">
        <div class="card">
          <div class="card-title">Sign in / Create account</div>
          <div id="auth-message" class="notice" style="display:none"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button id="auth-tab-login" class="btn btn-purple" onclick="showAuthMode('login')">Sign in</button>
            <button id="auth-tab-signup" class="btn btn-soft" onclick="showAuthMode('signup')">Create account</button>
          </div>
          <div style="display:grid;gap:12px">
            <div id="auth-name-group" class="form-group" style="display:none">
              <label>Full name (signup)</label>
              <input id="auth-full-name" placeholder="Needed for sign up">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input id="auth-email" type="email" placeholder="name@email.com">
            </div>
            <div class="form-group">
              <label>Password</label>
              <input id="auth-password" type="password" placeholder="Password">
            </div>
            <div id="auth-forgot-wrap" style="margin-top:-4px">
              <button type="button" onclick="handleForgotPassword()" style="border:none;background:none;padding:0;color:var(--purple);font-size:12px;font-weight:800;cursor:pointer">
                Forgot password?
              </button>
            </div>
            <div id="auth-fellowship-group" class="form-group" style="display:none">
              <label>Fellowship (signup)</label>
              <select id="auth-fellowship">
                <option value="">Choose your fellowship</option>
                <option>Brock University</option>
                <option>Toronto Metropolitan University</option>
                <option>University of Guelph</option>
                <option>University of Toronto Mississauga</option>
                <option>University of Toronto Scarborough</option>
                <option>University of Waterloo</option>
                <option>Wilfred Laurier University</option>
                <option>Western University</option>
                <option>York University</option>
                <option>Seneca College</option>
                <option>Sheridan College</option>
              </select>
            </div>
            <div class="notice" id="auth-helper-copy">
              Sign in with your email and password.
            </div>
            <div>
              <button id="auth-primary-btn" class="btn btn-purple btn-full" onclick="handleSupabaseLogin()">Sign in</button>
            </div>
          </div>
        </div>
      </div>`;
    showAuthMode("login");
  }

  function showAuthMode(mode) {
    const isSignup = mode === "signup";
    const loginTab = byId("auth-tab-login");
    const signupTab = byId("auth-tab-signup");
    const nameGroup = byId("auth-name-group");
    const fellowshipGroup = byId("auth-fellowship-group");
    const forgotWrap = byId("auth-forgot-wrap");
    const primaryBtn = byId("auth-primary-btn");
    const helperCopy = byId("auth-helper-copy");

    if (loginTab) loginTab.className = `btn ${isSignup ? "btn-soft" : "btn-purple"}`;
    if (signupTab) signupTab.className = `btn ${isSignup ? "btn-purple" : "btn-soft"}`;
    if (nameGroup) nameGroup.style.display = isSignup ? "block" : "none";
    if (fellowshipGroup) fellowshipGroup.style.display = isSignup ? "block" : "none";
    if (forgotWrap) forgotWrap.style.display = isSignup ? "none" : "block";
    if (primaryBtn) {
      primaryBtn.textContent = isSignup ? "Create account" : "Sign in";
      primaryBtn.setAttribute("onclick", isSignup ? "handleSupabaseSignup()" : "handleSupabaseLogin()");
    }
    if (helperCopy) {
      helperCopy.textContent = isSignup
        ? "Create account with your name, email, password, and fellowship."
        : "Sign in with your email and password.";
    }
    clearAuthMessage();
    if (isSignup) loadFellowshipOptions();
  }

  const oldLogout = typeof logout === "function" ? logout : null;
  window.logout = async function logoutOverride() {
    try {
      const session = await PCDL.getSession();
      if (session) return handleSupabaseLogout();
    } catch (_) {}
    if (oldLogout) oldLogout();
  };

  window.hydrateSupabaseUser = hydrateSupabaseUser;
  window.handleSupabaseLogin = handleSupabaseLogin;
  window.handleSupabaseSignup = handleSupabaseSignup;
  window.handleSupabaseLogout = handleSupabaseLogout;
  window.handleForgotPassword = handleForgotPassword;
  window.renderSignup = renderSignup;
  window.showAuthMode = showAuthMode;

  async function initApp() {
    if (window.PCDLSchemaValidator?.run) {
      await window.PCDLSchemaValidator.run();
    }
    const hasUser = await hydrateSupabaseUser();
    if (!hasUser && typeof renderSignup === "function") renderSignup();
    else if (!hasUser && typeof render === "function") render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
