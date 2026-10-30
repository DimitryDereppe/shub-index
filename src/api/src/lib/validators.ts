export function isValidPassword(password: string) {

  // Vérifier que le mot de passe soit compris entre 8 et 16 caractères
  if (password.length < 8 || password.length > 16) {
    return false;
  }

  // Vérifier que le mot de passe ait au moins une majuscule
  if (!/[A-Z]/.test(password)) {
    return false;
  }

  // Vérifier que le mot de passe ait au moins une minuscule
  if (!/[a-z]/.test(password)) {
    return false;
  }

  // Vérifier que le mot de passe ait au moins un chiffre
  if (!/[0-9]/.test(password)) {
    return false;
  }

  // Vérifier que le mot de passe ait au moins un caractère spéciale
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return false;
  }

  return true;
}
