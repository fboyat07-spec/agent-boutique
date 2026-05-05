import { useEffect, useState } from "react";
import api from "../services/api";

export default function Dashboard() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    api.get("/dashboard/stats").then((res) => {
      setStats(res.data);
    });
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="bg-white p-4 shadow rounded">
          <h3 className="text-lg font-semibold">Total Leads</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.total || 0}</p>
        </div>
        <div className="bg-white p-4 shadow rounded">
          <h3 className="text-lg font-semibold">Won</h3>
          <p className="text-2xl font-bold text-green-600">{stats.won || 0}</p>
        </div>
        <div className="bg-white p-4 shadow rounded">
          <h3 className="text-lg font-semibold">Pending</h3>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending || 0}</p>
        </div>
      </div>
    </div>
  );
}
