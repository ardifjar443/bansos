import { useEffect, useState } from "react";
import {
  get_stats,
  get_stats_semua_desa,
  getDesa,
  getKerentanan,
} from "../services/api";
import TableKerentanan from "./TableKerentanan";
import PangatikanMap from "./PangatikanMap";

// --- KOMPONEN LOADING & ERROR ---
const LoadingComponent = () => (
  <div className="flex flex-col items-center justify-center py-20 space-y-4">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    <p className="text-gray-500 font-medium animate-pulse">
      Sedang memuat data terbaru...
    </p>
  </div>
);

const ErrorComponent = ({ onRetry }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-red-200 rounded-xl bg-red-50">
    <svg
      className="h-12 w-12 text-red-400 mb-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <h3 className="text-lg font-bold text-red-700">Gagal Memuat Data</h3>
    <p className="text-red-500 max-w-md mb-4">
      Terjadi kesalahan koneksi atau waktu tunggu habis.
    </p>
    <button
      onClick={onRetry}
      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
    >
      Coba Lagi
    </button>
  </div>
);

// --- KOMPONEN UTAMA ---
const Rekomendasi = () => {
  const [desaList, setDesaList] = useState([]);
  const [selectedDesa, setSelectedDesa] = useState("SEMUA");

  // Data States
  const [data, setData] = useState([]); // Data Table (Array)
  const [paginationInfo, setPaginationInfo] = useState({}); // Metadata Pagination
  const [dataStat, setDataStat] = useState([]); // Data Peta
  const [dataStatSemuaDesa, setDataStatSemuaDesa] = useState([]); // Data Peta Global

  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Filter States (Pagination, Limit, Search)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10); // Default 10 baris
  const [search, setSearch] = useState(""); // State Search Baru

  // 1. Fetch Daftar Desa (Sekali saja)
  useEffect(() => {
    getDesa().then(setDesaList).catch(console.error);
  }, []);

  // 2. Fetch Data Utama (Dipanggil saat Filter Berubah)
  useEffect(() => {
    let isMounted = true;
    const timeoutThreshold = 15000; // 15 Detik

    const fetchAllData = async () => {
      setIsLoading(true);
      setIsError(false);

      const timeoutId = setTimeout(() => {
        if (isMounted) {
          setIsLoading(false);
          setIsError(true);
        }
      }, timeoutThreshold);

      try {
        // Panggil API dengan parameter lengkap
        // Note: get_stats map tidak butuh pagination, jadi aman dipanggil berulang atau dipisah jika mau optimasi
        const [resKerentanan, resStats, resAllStats] = await Promise.all([
          getKerentanan(selectedDesa, page, limit, search), // <-- Perbaikan disini
          get_stats(selectedDesa),
          get_stats_semua_desa(),
        ]);

        clearTimeout(timeoutId);

        if (isMounted) {
          // Pisahkan data rows dan pagination metadata
          setData(resKerentanan.data);
          setPaginationInfo(resKerentanan.pagination);

          setDataStat(resStats);
          setDataStatSemuaDesa(resAllStats);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        if (isMounted) {
          setIsLoading(false);
          setIsError(true);
        }
      }
    };

    fetchAllData();

    return () => {
      isMounted = false;
    };

    // --- PERBAIKAN UTAMA ADA DISINI ---
    // Tambahkan 'page', 'limit', dan 'search' ke dependency array.
    // React akan menjalankan ulang fetchAllData setiap kali variabel ini berubah.
  }, [selectedDesa, page, limit, search]);

  // Handler saat Ganti Desa
  const handleDesaChange = (e) => {
    setSelectedDesa(e.target.value);
    setPage(1); // Reset ke halaman 1 jika desa ganti
    setSearch(""); // Opsional: Reset search jika desa ganti
  };

  const handleRetry = () => {
    // Force re-render dengan ubah state dummy atau reset
    setIsLoading(true);
    setPage(1); // Coba reset ke page 1
  };

  return (
    <div className="p-5 min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center w-full p-4 md:px-12 bg-white rounded-xl shadow-sm mb-6 border border-gray-100">
        <h1 className="w-full text-gray-800 font-bold text-2xl md:text-3xl">
          Kecamatan Pangatikan
        </h1>
        <div className="relative w-full md:w-1/3">
          <select
            value={selectedDesa}
            onChange={handleDesaChange}
            disabled={isLoading}
            className="w-full appearance-none bg-white border border-gray-300 text-gray-700 py-2.5 px-4 pr-10 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium disabled:bg-gray-100"
          >
            <option value="SEMUA">SEMUA DESA</option>
            {desaList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="space-y-8">
        {isLoading ? (
          <LoadingComponent />
        ) : isError ? (
          <ErrorComponent onRetry={handleRetry} />
        ) : (
          <>
            <div className="transition-opacity duration-500 ease-in-out opacity-100">
              <PangatikanMap
                data={dataStat}
                desa={selectedDesa}
                semuaDesa={dataStatSemuaDesa}
              />
            </div>

            <div className="mt-8 transition-opacity duration-500 ease-in-out opacity-100">
              {/* TABLE COMPONENT */}
              <TableKerentanan
                data={data} // Kirim Array Data
                pagination={paginationInfo} // Kirim Metadata Pagination
                page={page}
                limit={limit}
                setPage={setPage}
                setLimit={setLimit}
                onSearch={setSearch} // Kirim fungsi setSearch ke Table
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Rekomendasi;
