import React, { useState } from "react";
import { trainKmeans } from "../services/api";

const Navbar = () => {
  // State untuk mengontrol status loading
  const [isLoading, setIsLoading] = useState(false);

  const handleTrain = async () => {
    // 1. Munculkan Popup Loading
    setIsLoading(true);

    try {
      // 2. Panggil API
      const r = await trainKmeans();

      // Beri sedikit delay agar loading tidak kedip terlalu cepat (opsional)
      // await new Promise(resolve => setTimeout(resolve, 500));

      // 3. Matikan Loading
      setIsLoading(false);

      // 4. Munculkan Notifikasi Sukses
      // Alert browser akan menahan eksekusi sampai user klik "OK"
      alert("Berhasil: " + r.message);

      // 5. Refresh Website
      window.location.reload();
    } catch (error) {
      setIsLoading(false);
      console.error(error);
      alert("Gagal melakukan training data. Silakan coba lagi.");
    }
  };

  return (
    <>
      {/* --- POPUP LOADING OVERLAY --- */}
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center animate-bounce-in">
            {/* Loading Spinner (DaisyUI / Tailwind) */}
            <span className="loading loading-spinner loading-lg text-blue-600 mb-4"></span>
            <h3 className="text-lg font-bold text-gray-800">
              Sedang Memproses...
            </h3>
            <p className="text-sm text-gray-500">
              Mohon tunggu, sedang melakukan training K-Means.
            </p>
          </div>
        </div>
      )}

      {/* --- NAVBAR UTAMA --- */}
      <div className="navbar bg-[#112D4E] shadow-sm px-4 md:px-12 relative z-10">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl text-white">PKH</a>
        </div>
        <div className="flex-none">
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar"
            >
              <div className="w-10 rounded-full border-2 border-white/20">
                <img
                  alt="User Avatar"
                  src="https://img.daisyui.com/images/stock/photo-1534528741775-53994a69daeb.webp"
                />
              </div>
            </div>
            <ul
              tabIndex="-1"
              className="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow"
            >
              <li>
                <a className="justify-between">
                  Profile
                  <span className="badge">New</span>
                </a>
              </li>
              <li>
                {/* Tombol di menu dropdown */}
                <button
                  onClick={handleTrain}
                  className="text-blue-600 font-semibold hover:bg-blue-50"
                  disabled={isLoading} // Disable tombol saat loading
                >
                  Update K-Means
                </button>
              </li>
              <li>
                <a>Settings</a>
              </li>
              <li>
                <a>Logout</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
