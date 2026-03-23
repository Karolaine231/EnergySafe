const form = document.getElementById("loginForm");
const errorBox = document.getElementById("errorBox");

function showError(msg){
  errorBox.textContent = msg;
  errorBox.style.display = "block";
}

function clearError(){
  errorBox.textContent = "";
  errorBox.style.display = "none";
}

function saveAuth(email, profile, persistMode){
  const payload = {
    isAuthenticated: true,
    email: email,
    profile: profile,
    loginAt: new Date().toISOString()
  };

  if(persistMode === "local"){
    localStorage.setItem("energiaVerde_auth", JSON.stringify(payload));
    sessionStorage.removeItem("energiaVerde_auth");
  } else {
    sessionStorage.setItem("energiaVerde_auth", JSON.stringify(payload));
    localStorage.removeItem("energiaVerde_auth");
  }
}

form.addEventListener("submit", function(e){
  e.preventDefault();
  clearError();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const profile = document.getElementById("profile").value;

  // No seu HTML atual você removeu o select "remember"
  // Então vamos deixar um padrão seguro:
  const rememberEl = document.getElementById("remember");
  const persistMode = rememberEl ? rememberEl.value : "local";

  if(!email || !password){
    showError("Preencha e-mail e senha.");
    return;
  }

  saveAuth(email, profile, persistMode);

  // Se você ainda não tem dashboard.html, isso vai dar erro 404.
  // Pode trocar para "financeiro.html" ou outra página que exista.
  window.location.href = "financeiro.html";
});

/* Botão Entenda mais sobre */
const btnSobre = document.getElementById("btnSobre");
if (btnSobre) {
  btnSobre.addEventListener("click", () => {
    window.location.href = "sobre.html";
  });
}