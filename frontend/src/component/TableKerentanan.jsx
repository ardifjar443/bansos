import React, { useState } from "react";

// Helper Colors
const getStatusColor = (kategori) => {
  const k = kategori ? kategori.toLowerCase() : "";
  if (k.includes("sangat rentan"))
    return "bg-red-100 text-red-700 border border-red-200";
  if (k.includes("tidak rentan"))
    return "bg-green-100 text-green-700 border border-green-200";
  if (k.includes("rentan"))
    return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  return "bg-gray-100 text-gray-700";
};

export default function TableKerentanan({
  data = [],
  pagination,
  page,
  limit,
  setPage,
  setLimit,
  onSearch,
}) {
  const [localSearch, setLocalSearch] = useState("");

  // --- PERBAIKAN 1: Hapus useEffect Debounce ---
  // Kita ganti dengan trigger manual (Enter / Klik Tombol)

  const handleTriggerSearch = () => {
    if (onSearch) {
      onSearch(localSearch); // Kirim kata kunci ke parent hanya saat dipanggil
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleTriggerSearch();
    }
  };

  // Normalisasi Data
  const tableRows = Array.isArray(data) ? data : data.data || [];
  const metaPagination = pagination || data.pagination || {};

  const totalPages = metaPagination.total_pages || 1;
  const totalItems = metaPagination.total_items || 0;

  // Hitung display index
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);

  return (
    <div className="bg-gray-50 rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <h1 className="text-black text-center font-bold text-3xl mt-6 mb-2">
        Rekomendasi Penerima Bansos
      </h1>

      {/* --- HEADER CONTROLS --- */}
      <div className="p-5 flex flex-col md:flex-row justify-between items-center gap-4 bg-white border-b border-gray-100">
        {/* Limit Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 font-medium">Tampilkan</span>
          <div className="relative">
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="appearance-none border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-700 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                ></path>
              </svg>
            </div>
          </div>
          <span className="text-sm text-gray-600 font-medium">baris</span>
        </div>

        {/* --- PERBAIKAN 2: Input Search + Button --- */}
        <div className="flex w-full md:w-auto gap-2">
          <div className="relative w-full md:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              className="w-full py-2 pl-10 pr-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Cari Nama / ID..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={handleKeyDown} // Trigger saat Enter
            />
          </div>
          <button
            onClick={handleTriggerSearch}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
          >
            Cari
          </button>
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-[#112D4E] text-white uppercase text-xs tracking-wider font-semibold">
              <th className="px-6 py-4">ID Keluarga</th>
              <th className="px-6 py-4">No KK</th>
              <th className="px-6 py-4">Nama Kepala</th>
              <th className="px-6 py-4">Alamat</th>
              <th className="px-6 py-4">Desa</th>
              <th className="px-6 py-4 text-center">Tanggungan</th>
              <th className="px-6 py-4">Kategori</th>
              <th className="px-6 py-4 text-right">Skor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {tableRows.length > 0 ? (
              tableRows.map((r, index) => (
                <tr
                  key={r.id_keluarga || index}
                  className="hover:bg-blue-50 transition-colors duration-150 text-sm text-gray-700"
                >
                  <td className="px-6 py-3 font-medium text-gray-900">
                    {r.id_keluarga}
                  </td>
                  <td className="px-6 py-3">
                    {r.no_kk
                      ? r.no_kk.toString().slice(0, 2) + "**************"
                      : "-"}
                  </td>
                  <td className="px-6 py-3 font-semibold uppercase text-blue-900">
                    {r.nama_kepala_keluarga || "-"}
                  </td>
                  <td className="px-6 py-3 truncate max-w-xs" title={r.alamat}>
                    {r.alamat || "-"}
                  </td>
                  <td className="px-6 py-3">{r.desa}</td>
                  <td className="px-6 py-3 text-center">
                    {r.jumlah_tanggungan}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getStatusColor(
                        r.kategori_kerentanan,
                      )}`}
                    >
                      {r.kategori_kerentanan || "-"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-mono font-bold text-blue-600">
                    {r.skor_akhir}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="8"
                  className="px-6 py-12 text-center text-gray-400 italic bg-gray-50"
                >
                  <div className="flex flex-col items-center">
                    Data tidak ditemukan
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- PAGINATION FOOTER --- */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white border-t border-gray-100 gap-4">
        <div className="text-sm text-gray-600">
          Menampilkan{" "}
          <span className="font-bold text-gray-900">
            {totalItems > 0 ? startItem : 0}
          </span>{" "}
          - <span className="font-bold text-gray-900">{endItem}</span> dari{" "}
          <span className="font-bold text-gray-900">{totalItems}</span> data
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
              page === 1
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-700 border-gray-300 hover:bg-white hover:text-blue-600 hover:border-blue-500 shadow-sm"
            }`}
          >
            Prev
          </button>

          <span className="text-sm font-medium bg-gray-50 px-4 py-2 rounded border border-gray-200 text-gray-800">
            Halaman {page} / {totalPages}
          </span>

          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
              page >= totalPages
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-700 border-gray-300 hover:bg-white hover:text-blue-600 hover:border-blue-500 shadow-sm"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
