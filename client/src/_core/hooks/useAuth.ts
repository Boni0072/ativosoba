import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { toast } from "sonner";
import { playSuccessSound, playErrorSound } from "@/lib/utils";

export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Escuta alterações na autenticação do Firebase (Login/Logout)
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("Auth State Changed:", firebaseUser ? "Logged In" : "Logged Out");
      if (firebaseUser) {
        // Usuário logado via Firebase
        setUser({
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Usuário",
          email: firebaseUser.email,
          role: "diretoria", // Permissão total padrão para versão sem backend
          avatar: firebaseUser.photoURL
        });
      } else {
        // Fallback: Verifica se há um usuário salvo no localStorage (Login manual)
        const storedUser = localStorage.getItem("obras_user");
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
          } catch (error) {
            console.error("Erro ao recuperar sessão:", error);
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("obras_user");
      localStorage.removeItem("obras_token");
      setUser(null);
      
      playSuccessSound();
      toast.success("Sessão encerrada com sucesso");
      
      setTimeout(() => {
        window.location.href = "/login"; // Redirecionamento forçado para garantir limpeza de estado
      }, 1000);
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      playSuccessSound();
      toast.success("Login realizado com sucesso");
    } catch (error) {
      console.error("Erro no login com Google:", error);
      playErrorSound();
      toast.error("Falha ao realizar login", { description: "Tente novamente." });
      throw error;
    }
  };

  return {
    user,
    isLoading,
    loading: isLoading, // Alias para compatibilidade com App.tsx
    isAuthenticated: !!user, // Alias para compatibilidade com App.tsx
    logout,
    loginWithGoogle
  };
}