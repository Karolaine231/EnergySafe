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

form.addEventListener("submit", function(e){
  e.preventDefault();
  clearError();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();

  if(!email || !password){
    showError("Preencha e-mail e senha.");
    return;
  }

  // 👇 EMAILS PERMITIDOS (você pode mudar depois)
  const emailFinanceiro = "financeiro@energia.com";
  const emailManutencao = "manutencao@energia.com";

  if(email === emailFinanceiro){
    // salva sessão (opcional)
    localStorage.setItem("perfil", "financeiro");
    window.location.href = "financeiro.html";
  }
  else if(email === emailManutencao){
    localStorage.setItem("perfil", "manutencao");
    window.location.href = "manutencao.html";
  }
  else{
    showError("E-mail não autorizado.");
  }
});
