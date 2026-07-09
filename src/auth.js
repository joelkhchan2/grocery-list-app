export async function currentSession(client) {
  const { data } = await client.auth.getSession();
  return data.session;
}
export async function signIn(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}
export async function signOut(client) { await client.auth.signOut(); }

export function renderSignIn(mount, onSubmit) {
  mount.innerHTML = `
    <form class="signin">
      <h1>Our Grocery Lists</h1>
      <input type="email" name="email" placeholder="Email" autocomplete="username" required>
      <input type="password" name="password" placeholder="Password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
      <p class="err" hidden></p>
    </form>`;
  const form = mount.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = form.querySelector(".err"); err.hidden = true;
    try { await onSubmit(form.email.value.trim(), form.password.value); }
    catch (ex) { err.textContent = "Sign-in failed — check the shared login."; err.hidden = false; }
  });
}
