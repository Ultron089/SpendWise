import { useEffect, useState } from "react";
import {
  API_BASE_URL,
  AUTH_STORAGE_KEY,
  PENDING_ORDERS_STORAGE_KEY,
} from "../shared/constants";

function Popup() {
  const [account, setAccount] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [authMode, setAuthMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("info");
  const [verificationUserId, setVerificationUserId] = useState("");

  useEffect(() => {
    const refreshStorage = () => {
      chrome.storage.session.get(AUTH_STORAGE_KEY).then((stored) => {
        setAccount(stored[AUTH_STORAGE_KEY]?.user || null);
      });
      chrome.storage.local.get(PENDING_ORDERS_STORAGE_KEY).then((stored) => {
        setPendingCount(
          stored[PENDING_ORDERS_STORAGE_KEY]?.length || 0,
        );
      });
    };

    const handleStorageChange = (changes, areaName) => {
      if (areaName === "session" && changes[AUTH_STORAGE_KEY]) {
        setAccount(changes[AUTH_STORAGE_KEY].newValue?.user || null);
        setVerificationUserId("");
      }
      if (areaName === "local" && changes[PENDING_ORDERS_STORAGE_KEY]) {
        setPendingCount(
          changes[PENDING_ORDERS_STORAGE_KEY].newValue?.length || 0,
        );
      }
    };

    refreshStorage();
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setPassword("");
    setConfirmPassword("");
    setNotice("");
    setNoticeType("info");
  };

  const signIn = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const body = await response.json().catch(() => ({}));

      if (
        !response.ok ||
        typeof body?.token !== "string" ||
        !body.token ||
        !body.user ||
        typeof body.user.email !== "string"
      ) {
        throw new Error(body?.message || "Sign-in failed. Check your details.");
      }

      const signedInUser = {
        email: body.user.email,
        name: typeof body.user.name === "string" ? body.user.name : body.user.email,
      };
      await chrome.storage.session.set({
        [AUTH_STORAGE_KEY]: { token: body.token, user: signedInUser },
      });
      setAccount(signedInUser);
      setPassword("");
      setNotice("Signed in. Review your staged orders before importing.");
      setNoticeType("success");
    } catch (error) {
      setNotice(
        error instanceof TypeError
          ? "Could not reach the SpendWise server. Check that it is running."
          : error.message,
      );
      setNoticeType("error");
    } finally {
      setBusy(false);
    }
  };

  const register = async (event) => {
    event.preventDefault();
    setNotice("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice("Enter a valid email address.");
      setNoticeType("error");
      return;
    }
    if (!password) {
      setNotice("Enter a password.");
      setNoticeType("error");
      return;
    }
    if (password !== confirmPassword) {
      setNotice("Passwords do not match.");
      setNoticeType("error");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: normalizedEmail,
          password,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok || typeof body?.user?.email !== "string") {
        throw new Error(
          body?.message || "Could not create your account. Please try again.",
        );
      }

      setEmail(body.user.email);
      setName("");
      setPassword("");
      setConfirmPassword("");
      setAuthMode("signin");
      setNotice("Account created. Sign in with your new credentials.");
      setNoticeType("success");
    } catch (error) {
      setNotice(
        error instanceof TypeError
          ? "Could not reach the SpendWise server. Check that it is running."
          : error.message,
      );
      setNoticeType("error");
    } finally {
      setBusy(false);
    }
  };

  const importOrders = async () => {
    setBusy(true);
    setNotice("");

    try {
      const result = await chrome.runtime.sendMessage({
        type: "IMPORT_HISTORICAL_ORDERS",
      });

      if (result?.status === "unauthorized") {
        setAccount(null);
        throw new Error(result.message);
      }
      if (result?.status !== "success" && result?.status !== "partial") {
        throw new Error(result?.message || "Import failed. Staged orders were kept.");
      }

      const { imported, duplicates, excluded, failed } = result.summary;
      const failureDetails = result.summary.errors
        .map(
          (failure) =>
            `Order ${failure.index + 1}: ${failure.message} (${failure.code})`,
        )
        .join(" ");
      setNotice(
        `Imported ${imported}; already present ${duplicates}; excluded ${excluded}; failed ${failed}. ${result.remaining} orders remain staged.${failureDetails ? ` ${failureDetails}` : ""}`,
      );
      setNoticeType(failed ? "error" : "success");
    } catch (error) {
      setNotice(error.message || "Import failed. Staged orders were kept.");
      setNoticeType("error");
   } finally {
  const stored = await chrome.storage.local.get(
    "spendwisePendingOrders"
  );

  setPendingCount(
    (stored.spendwisePendingOrders || []).length
  );

  setBusy(false);
}
  };

  const showVerificationUserId = async () => {
    setBusy(true);
    setNotice("");

    try {
      const stored = await chrome.storage.session.get(AUTH_STORAGE_KEY);
      const token = stored[AUTH_STORAGE_KEY]?.token;
      if (typeof token !== "string" || !token) {
        setAccount(null);
        throw new Error("Sign in again before retrieving the verification ID.");
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok || typeof body?.user?.id !== "string") {
        if (response.status === 401) {
          await chrome.storage.session.remove(AUTH_STORAGE_KEY);
          setAccount(null);
        }
        throw new Error("Could not verify the signed-in account. Sign in again.");
      }

      setVerificationUserId(body.user.id);
      setNotice("User ID retrieved from the authenticated session. The token was not displayed or saved.");
      setNoticeType("success");
    } catch (error) {
      setNotice(
        error instanceof TypeError
          ? "Could not reach the SpendWise server. Check that it is running."
          : error.message,
      );
      setNoticeType("error");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await chrome.storage.session.remove(AUTH_STORAGE_KEY);
    setAccount(null);
    setNotice("Signed out. Staged orders are still available.");
    setNoticeType("info");
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/index.html") });
  };

  const importCount = Math.min(pendingCount, 50);

  return (
    <div className="app-shell popup-shell">
      <header className="popup-header">
        <div>
          <div className="eyebrow">SpendWise</div>
          <h1>Amazon history import</h1>
        </div>
      </header>

      <section className="panel import-panel">
        {account ? (
          <div className="account-row">
            <div>
              <div className="muted-label">Signed in as</div>
              <strong>{account.name}</strong>
              <div className="muted-label">{account.email}</div>
            </div>
            <button className="text-button" onClick={signOut} type="button">
              Sign out
            </button>
          </div>
        ) : (
          <form
            className="auth-form"
            onSubmit={authMode === "signin" ? signIn : register}
          >
            <h2>{authMode === "signin" ? "Sign in to SpendWise" : "Create your account"}</h2>
            {authMode === "register" && (
              <label>
                Name
                <input
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  type="text"
                  value={name}
                />
              </label>
            )}
            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {authMode === "register" && (
              <label>
                Confirm password
                <input
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </label>
            )}
            <button className="primary-button" disabled={busy} type="submit">
              {busy
                ? authMode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : authMode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
            <div className="auth-mode-switch">
              <span>
                {authMode === "signin" ? "New to SpendWise?" : "Already have an account?"}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  switchAuthMode(authMode === "signin" ? "register" : "signin")
                }
                type="button"
              >
                {authMode === "signin" ? "Create account" : "Back to sign in"}
              </button>
            </div>
          </form>
        )}

        {account && (
          <div className="verification-id-panel">
            <button
              className="text-button"
              disabled={busy}
              onClick={showVerificationUserId}
              type="button"
            >
              {verificationUserId ? "Refresh verification ID" : "Get verification ID"}
            </button>
            {verificationUserId && (
              <code className="verification-user-id">{verificationUserId}</code>
            )}
          </div>
        )}

        <div className="pending-import">
          <div>
            <div className="muted-label">Orders staged for review</div>
            <strong>{pendingCount}</strong>
          </div>
          <button
            className="primary-button"
            disabled={!account || pendingCount === 0 || busy}
            onClick={importOrders}
            type="button"
          >
            {busy
              ? "Working..."
              : `Import ${importCount} ${importCount === 1 ? "order" : "orders"}`}
          </button>
        </div>

        <p className="action-note">
          Extracted orders are only staged. They are sent to SpendWise when you
          select Import. Imports are processed in batches of up to 50.
        </p>
        {notice && (
          <p className={`action-notice action-notice--${noticeType}`} role="status">
            {notice}
          </p>
        )}
      </section>

      <button className="secondary-button" onClick={openDashboard} type="button">
        View Full Dashboard
      </button>
    </div>
  );
}

export default Popup;