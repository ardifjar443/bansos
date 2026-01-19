export const API = "http://localhost:8000";

export async function getDesa() {
  return fetch(`${API}/kerentanan/desa`).then((res) => res.json());
}

export async function getKerentanan(desa, page = 1, limit = 10, search = "") {
  // Bangun URL dengan Query Params
  const params = new URLSearchParams({
    page: page,
    limit: limit,
  });

  if (desa && desa !== "SEMUA") params.append("desa", desa);
  if (search) params.append("search", search);

  const url = `${API}/kerentanan?${params.toString()}`;

  return fetch(url).then((res) => res.json());
}

export async function get_stats(desa) {
  let url = `${API}/dashboard-stats`;
  if (desa && desa !== "SEMUA") url += `?desa=${desa}`;
  return fetch(url).then((res) => res.json());
}

export async function get_stats_semua_desa() {
  let url = `${API}/dashboard-stats-semua-desa`;
  return fetch(url).then((res) => res.json());
}

export async function trainKmeans() {
  return fetch(`${API}/train-kmeans`, {
    method: "POST",
  }).then((res) => res.json());
}
