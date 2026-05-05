import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Billing from "./pages/Billing";
import Navbar from "./components/Navbar";

function App() {
  const token = localStorage.getItem("token");

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        {token && <Navbar />}
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/billing" element={<Billing />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
