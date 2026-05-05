import { useState } from "react";
import api from "../services/api";

export default function Login() {
  const [email, setEmail] = useState("");

  const handleLogin = async () => {
    const res = await api.post("/api/auth/login", { email });
    localStorage.setItem("token", res.data.token);
    window.location.href = "/dashboard";
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="p-6 bg-white shadow rounded">
        <input
          className="border p-2 w-full"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="mt-4 bg-black text-white px-4 py-2" onClick={handleLogin}>
          Login
        </button>
      </div>
    </div>
  );
}
