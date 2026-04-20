const { escapeHtml } = require("./helpers");

const normalizePath = (value) => {
  const raw = String(value || "/")
    .split("?")[0]
    .replace(/\/+$/, "");
  return raw || "/";
};

const renderNavAuth = ({ currentUser, csrfToken, currentPath = "" }) => {
  const safePath = normalizePath(currentPath);
  const isActive = (path) => safePath === normalizePath(path);

  if (!currentUser) {
    return [
      `<a class="nav-link nav-login-link ${isActive("/login") ? "active" : ""}" href="/login">Login</a>`,
      `<a class="nav-link nav-register-btn ${isActive("/register") ? "active" : ""}" href="/register">Register</a>`,
    ].join("");
  }

  const username = escapeHtml(currentUser.username || "User");

  return `
	<a class="nav-link nav-icon-link nav-camera ${isActive("/edit") ? "active" : ""}" href="/edit" aria-label="Open editor">
	  <i class="fa-solid fa-camera" aria-hidden="true"></i>
	</a>
	<details class="profile-menu">
	  <summary class="nav-link nav-icon-link nav-profile-toggle ${isActive("/user/profile") ? "active" : ""}" aria-label="Open profile menu">
		<i class="fa-solid fa-user" aria-hidden="true"></i>
	  </summary>
	  <div class="profile-dropdown">
		<a class="profile-dropdown-link" href="/user/profile" title="${username}">
		  <i class="fa-solid fa-user" aria-hidden="true"></i>
		  <span class="profile-dropdown-username">${username}</span>
		</a>
		<form class="profile-dropdown-form" method="POST" action="/logout">
		  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
		  <button type="submit" class="profile-dropdown-logout">
			<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
			<span>Logout</span>
		  </button>
		</form>
	  </div>
	</details>
  `;
};

module.exports = renderNavAuth;
