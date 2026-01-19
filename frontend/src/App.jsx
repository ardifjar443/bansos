import { useEffect, useState } from "react";
import axios from "axios";
import PangatikanMap from "./component/PangatikanMap";
import Rekomendasi from "./component/Rekomendasi";
import Navbar from "./component/Navbar";

function App() {
  const [desaList, setDesaList] = useState([]);
  const [selectedDesa, setSelectedDesa] = useState("");
  const [keluarga, setKeluarga] = useState([]);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10); // jumlah per halaman
  const [totalPages, setTotalPages] = useState(1);

  const handleFilter = (e) => {
    const desa = e.target.value;
    setSelectedDesa(desa);
    loadKeluarga(desa, 1, limit); // reset ke halaman 1
  };

  return (
    <div className="bg-[#DBE2EF]">
      <Navbar />
      <Rekomendasi />
    </div>
  );
}

export default App;
