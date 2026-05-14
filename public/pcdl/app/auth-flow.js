(() => {
  let fellowshipOptionsCache = null;
  let fellowshipOptionsLoading = null;
  let authStateListenerBound = false;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        fellowshipOptionsCache.map((f) => `<option value="${f.id}">${f.name}</option>`).join("");
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
        fellowshipOptionsCache.map((f) => `<option value="${f.id}">${f.name}</option>`).join("");
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
      const fellowshipSelect = byId("auth-fellowship");
      const selectedFellowship = fellowshipSelect?.value || "";
      const selectedFellowshipName = fellowshipSelect?.selectedOptions?.[0]?.textContent?.trim() || "";
      const selectedRole = "Member";

      if (!fullName || !email || !password || !selectedFellowship) {
        showAuthMessage("Enter full name, email, password, and fellowship.");
        return;
      }

      let fellowshipQuery = PCDL.supabase.from("fellowships").select("id, name");
      fellowshipQuery = UUID_PATTERN.test(selectedFellowship)
        ? fellowshipQuery.eq("id", selectedFellowship)
        : fellowshipQuery.eq("name", selectedFellowshipName || selectedFellowship);

      const { data: fellowshipRow, error: fellowshipError } = await fellowshipQuery.maybeSingle();
      if (fellowshipError) throw fellowshipError;
      if (!fellowshipRow?.id) {
        showAuthMessage("Selected fellowship is unavailable. Refresh and try again.");
        return;
      }

      localStorage.setItem("pcdl_selected_fellowship", fellowshipRow.name || selectedFellowshipName || selectedFellowship);
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

  async function handlePasswordResetSubmit() {
    try {
      const password = byId("auth-reset-password")?.value || "";
      if (!password || password.length < 6) {
        showAuthMessage("Enter a new password with at least 6 characters.");
        return;
      }
      const { error } = await PCDL.supabase.auth.updateUser({ password });
      if (error) throw error;
      showAuthMessage("Password updated. Sign in with your new password.", false);
      if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
      renderSignup();
      showAuthMode("login");
    } catch (err) {
      showAuthMessage(err.message || "Could not reset password.");
    }
  }

  function renderPasswordResetForm() {
    const main = typeof el === "function" ? el("main-content") : byId("main-content");
    if (!main) return;
    main.style.gridTemplateColumns = "";
    main.innerHTML = `
      <div class="two-pane">
        <div class="card">
          <div class="card-title">Set a new password</div>
          <div id="auth-message" class="notice" style="display:none"></div>
          <div style="display:grid;gap:12px">
            <div class="form-group">
              <label>New password</label>
              <input id="auth-reset-password" type="password" placeholder="New password">
            </div>
            <button class="btn btn-purple btn-full" onclick="handlePasswordResetSubmit()">Update password</button>
            <button class="btn btn-soft btn-full" onclick="renderSignup();showAuthMode('login')">Back to sign in</button>
          </div>
        </div>
      </div>`;
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
                <option value="" disabled>Loading fellowships...</option>
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
  window.handlePasswordResetSubmit = handlePasswordResetSubmit;
  window.renderPasswordResetForm = renderPasswordResetForm;
  window.renderSignup = renderSignup;
  window.showAuthMode = showAuthMode;

  async function initApp() {
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery")) {
      renderPasswordResetForm();
      return;
    }

    if (window.PCDLSchemaValidator?.run) {
      await window.PCDLSchemaValidator.run();
    }

    const hasUser = await hydrateSupabaseUser();

    if (!authStateListenerBound && PCDL?.supabase?.auth) {
      authStateListenerBound = true;
      PCDL.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session && !S.user) {
          await hydrateSupabaseUser();
        }
        if (event === "SIGNED_OUT") {
          S.user = null;
          S.page = "home";
          if (typeof renderSignup === "function") renderSignup();
        }
      });
    }

    if (!hasUser) {
      const session = await PCDL.getSession();
      if (session) {
        await hydrateSessionFallbackUser();
      } else if (typeof renderSignup === "function") {
        renderSignup();
      } else if (typeof render === "function") {
        render();
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
