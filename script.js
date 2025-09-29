

// -----------------------
// Configuration
const apiKey = "4d6cb4a7df98c008380d2898d40e93c5"; // your OpenWeather API key
const weatherUrl = "https://api.openweathermap.org/data/2.5/weather";
const forecastUrl = "https://api.openweathermap.org/data/2.5/forecast";
const airPollutionUrl = "https://api.openweathermap.org/data/2.5/air_pollution";

// -----------------------
// DOM refs
const cityInput = document.getElementById("cityInput");
const getWeatherBtn = document.getElementById("getWeatherBtn");
const aqiEl = document.getElementById("aqi");

const forecastContainer = document.getElementById("forecast");
const forecastChartCanvas = document.getElementById("forecastChart");
const humidityChartCanvas = document.getElementById("humidityChart");
const windChartCanvas = document.getElementById("windChart");

const compareCityA = document.getElementById("compareCityA");
const compareCityB = document.getElementById("compareCityB");
const runCompareBtn = document.getElementById("runCompare");
const compareResults = document.getElementById("compareResults");
const compareChartCanvas = document.getElementById("compareChart");

// forecast modal
const forecastModal = document.getElementById("forecastModal");
document.getElementById("closeForecastModal").onclick = () => {
  forecastModal.style.display = "none";
};

// Map UI controls (checkboxes)
const precipLayerCheckbox = document.getElementById("precipLayer");
const cloudsLayerCheckbox = document.getElementById("cloudsLayer");

// Chatbot DOM 
const openChatbotBtn = document.getElementById("openChatbotBtn");
const chatbotEl = document.getElementById("chatbot");
const chatBody = document.getElementById("chatBody");
const chatMessage = document.getElementById("chatMessage");

// -----------------------
// Map & chart globals
let map = null;
let marker = null;
let precipitationLayer = null;
let cloudsLayer = null;

let forecastChart = null;
let humidityChart = null;
let windChart = null;
let compareChart = null;
let lastSearchedCity = null;

// -----------------------
// Palette for forecast cards
function applyPalette(card, condition) {
  const theme = (condition || "").toLowerCase();
  let gradient;

  if (theme.includes("rain") || theme.includes("drizzle")) {
    gradient = "linear-gradient(135deg, #588157, #a7c957)";
  } else if (theme.includes("clear") || theme.includes("sky")) {
    gradient = "linear-gradient(135deg, #0077b6, #ade8f4)";
  } else if (theme.includes("haze") || theme.includes("autumn")) {
    gradient = "linear-gradient(135deg, #9c6644, #e6ccb2)";
  } else if (theme.includes("mist") || theme.includes("snow") || theme.includes("winter")) {
    gradient = "linear-gradient(135deg, #cccccc, #f2f2f2)";
  } else if (theme.includes("cloud")) {
    gradient = "linear-gradient(135deg, #adb5bd, #e9ecef)";
  } else if (theme.includes("smoke")) {
    gradient = "linear-gradient(135deg, #6c757d, #adb5bd)";
  } else if (theme.includes("sunny") || theme.includes("hot") || theme.includes("summer")) {
    gradient = "linear-gradient(135deg, #ff8800, #ffb700)";
  } else {
    gradient = "linear-gradient(135deg, #ffa500, #ffcc00)";
  }

  card.style.background = gradient;
  card.style.color = "#072044";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.boxShadow = "0 6px 18px rgba(0,0,0,0.12)";
  card.style.minWidth = "120px";
  card.style.margin = "6px";

}

// -----------------------
// Aggregate 3-hour forecast to daily summary (up to 5 days)
function aggregateForecast3hToDaily(forecastData) {
  if (!forecastData || !forecastData.list) return [];
  const buckets = {};

  forecastData.list.forEach(item => {
    const d = new Date(item.dt * 1000);
    const dayKey = d.toISOString().slice(0, 10);
    if (!buckets[dayKey]) {
      buckets[dayKey] = {
        dt: item.dt,
        temps: [], tempsMin: [], tempsMax: [],
        hums: [], winds: [], windDegs: [], icons: [], descs: []
      };
    }
    buckets[dayKey].dt = Math.min(buckets[dayKey].dt, item.dt);
    buckets[dayKey].temps.push(item.main.temp);
    buckets[dayKey].tempsMin.push(item.main.temp_min);
    buckets[dayKey].tempsMax.push(item.main.temp_max);
    buckets[dayKey].hums.push(item.main.humidity);
    buckets[dayKey].winds.push(item.wind.speed);
    buckets[dayKey].windDegs.push(item.wind.deg); 

    if (item.weather && item.weather[0]) {
      if (item.weather[0].icon) buckets[dayKey].icons.push(item.weather[0].icon);
      if (item.weather[0].description) buckets[dayKey].descs.push(item.weather[0].description);
    }
  });

  const mostFreq = arr => {
    if (!arr || arr.length === 0) return null;
    const counts = {};
    arr.forEach(x => counts[x] = (counts[x] || 0) + 1);
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  };
 const avg = arr => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  const days = Object.keys(buckets).sort().map(key => {
    const b = buckets[key];
    return {
      date: key,
      dt: b.dt,
      tempDay: avg(b.temps),
      tempMin: Math.min(...b.tempsMin),
      tempMax: Math.max(...b.tempsMax),
      humidity: Math.round(b.hums.reduce((s, v) => s + v, 0) / b.hums.length),
      wind_speed: avg(b.winds),
      wind_deg: avg(b.windDegs), 
      icon: mostFreq(b.icons),
      weatherDesc: mostFreq(b.descs) || "N/A",
      aqi: null
    };
  });

  return days.slice(0, 5);
}


// -----------------------
// Render forecast cards
function renderForecast(dailySummary) {
  forecastContainer.innerHTML = "";

  if (!dailySummary || dailySummary.length === 0) {
    forecastContainer.innerHTML = "<p>Forecast not available</p>";
    return;
  }

  dailySummary.forEach(day => {
    const date = new Date(day.date);
    const dayName = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

    const card = document.createElement("div");
    card.className = "forecast-card";
    card.style.display = "inline-block";
    card.style.verticalAlign = "top";

    card.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">${dayName}</div>
      ${day.icon ? `<img src="https://openweathermap.org/img/wn/${day.icon}.png" alt="" style="width:48px;height:48px;">` : ""}
      <div style="margin-top:6px; font-weight:600;">${day.tempMax} / ${day.tempMin} °C</div>
      <div style="font-size:13px; margin-top:6px;">Humidity: ${day.humidity}%</div>
      <div style="font-size:13px;">Wind: ${day.wind_speed} m/s</div>
    `;

    card.addEventListener("click", () => {
      document.getElementById("forecastDate").textContent = dayName;
      document.getElementById("forecastIcon").src = `https://openweathermap.org/img/wn/${day.icon}@2x.png`;
      document.getElementById("forecastTemp").textContent = `Temperature: ${day.tempMin}°C - ${day.tempMax}°C (Avg: ${day.tempDay}°C)`;
      document.getElementById("forecastHumidity").textContent = `Humidity: ${day.humidity}%`;
      document.getElementById("forecastWind").textContent = `Wind Speed: ${day.wind_speed} m/s`;
      document.getElementById("forecastAQI").textContent = `Air Quality: ${getAqiText(day.aqi)}`;
      document.getElementById("forecastWeather").textContent = `Condition: ${day.weatherDesc ? day.weatherDesc : "N/A"}`;
      let tempCategory = "Mild 🌤️";
      if (day.tempDay <= 15) tempCategory = "Cold ❄️";
      else if (day.tempDay >= 30) tempCategory = "Hot 🔥";
      document.getElementById("forecastTempCategory").textContent = `Feels: ${tempCategory}`;
      document.getElementById("forecastModal").style.display = "flex";
    });

    applyPalette(card, day.weatherDesc || "clear");
    forecastContainer.appendChild(card);
  });
}

async function fetchForecastByCoords(lat, lon) {
  try {
    const res = await fetch(`${forecastUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);
    const forecastData = await res.json();

    let dailySummary = aggregateForecast3hToDaily(forecastData);

    dailySummary = await Promise.all(dailySummary.map(async d => ({ ...d, aqi: await fetchAQIText(lat, lon) })));

    // Prepare data for charts
    const dailyForCharts = dailySummary.map(d => ({
      date: d.date,
      tempDay: d.tempDay,
      humidity: d.humidity,
      wind_speed: d.wind_speed,
      wind: { deg: d.wind_deg || 0, speed: d.wind_speed }
    }));

    // Render charts & forecast cards
    renderDetailedCharts(dailyForCharts);
    createWindDirectionChart(dailyForCharts);
    renderForecast(dailySummary);

  } catch (err) {
    console.error("fetchForecastByCoords error:", err);
  }
}

function getAqiText(aqi) {
  if (!aqi) return "N/A";
  switch (aqi) {
    case 1: return "Good 🟢";
    case 2: return "Fair 🟡";
    case 3: return "Moderate 🟠";
    case 4: return "Poor 🔴";
    case 5: return "Very Poor 🟣";
    default: return "Unknown";
  }
}

async function fetchAQIAndSetUI(lat, lon) {
  try {
    const res = await fetch(`${airPollutionUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}`);
    if (!res.ok) throw new Error(`AQI request failed (${res.status})`);
    const data = await res.json();
    const aqi = data?.list?.[0]?.main?.aqi;
    const levels = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];
    aqiEl.textContent = aqi ? `Air Quality Index: ${aqi} (${levels[aqi - 1]})` : "AQI not available";
  } catch (err) {
    console.warn("AQI error:", err);
    aqiEl.textContent = "AQI not available";
  }
}

async function fetchAQIText(lat, lon) {
  try {
    const res = await fetch(`${airPollutionUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}`);
    if (!res.ok) throw new Error("AQI fetch failed");

    const data = await res.json();
    const aqi = data.list?.[0]?.main?.aqi;
    const levels = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];

    return aqi ? `AQI: ${aqi} (${levels[aqi - 1]})` : "AQI not available";
  } catch (err) {
    return "AQI not available";
  }
}

// -----------------------
// Charts (uses Chart.js)
function renderDetailedCharts(dailyArray) {
  const labels = dailyArray.map(d => new Date(d.date).toLocaleDateString(undefined, { weekday: "short" }));
  const temps = dailyArray.map(d => d.tempDay);
  const humidity = dailyArray.map(d => d.humidity);
  const wind = dailyArray.map(d => d.wind_speed);

  if (forecastChart) { try { forecastChart.destroy(); } catch (e) { } forecastChart = null; }
  if (humidityChart) { try { humidityChart.destroy(); } catch (e) { } humidityChart = null; }
  if (windChart) { try { windChart.destroy(); } catch (e) { } windChart = null; }

  [forecastChartCanvas, humidityChartCanvas, windChartCanvas].forEach(c => {
    if (!c) return;
    c.style.backgroundColor = "#a2d2ff";
    c.style.borderRadius = "10px";
    c.style.padding = "6px";
    if (!c.style.height) c.style.height = "220px";
  });

  if (forecastChartCanvas && forecastChartCanvas.getContext) {
    forecastChart = new Chart(forecastChartCanvas.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Daily Temp (°C)", data: temps, backgroundColor: "rgba(54, 162, 235, 0.8)" }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#072044" }, grid: { color: "rgba(0,0,0,0.06)" } },
          y: { ticks: { color: "#072044" }, grid: { color: "rgba(0,0,0,0.06)" } }
        }
      }
    });
  }

  if (humidityChartCanvas && humidityChartCanvas.getContext) {
    humidityChart = new Chart(humidityChartCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Humidity (%)",
          data: humidity,
          fill: true,
          tension: 0.3,
          backgroundColor: "rgba(13, 110, 253, 0.2)",
          borderColor: "rgba(13, 110, 253, 0.9)"
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } } }
    });
  }

  if (windChartCanvas && windChartCanvas.getContext) {
    windChart = new Chart(windChartCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Wind (m/s)",
          data: wind,
          fill: false,
          tension: 0.3,
          borderColor: "rgba(220,53,69,0.9)"
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "top" } } }
    });
  }
}

function createWindDirectionChart(data) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const counts = Array(8).fill(0);

  // Count wind direction occurrences correctly
  data.forEach(d => {
    if (typeof d.wind.deg === "number") {
      const windDeg = d.wind.deg;
      const index = Math.floor((windDeg + 22.5) / 45) % 8; 
      counts[index]++;
    }
  });

  const total = counts.reduce((a, b) => a + b, 0);
  const percentages = counts.map(c => total > 0 ? ((c / total) * 100).toFixed(1) : 0);

  const ctx = document.getElementById("windDirectionChart").getContext("2d");

  if (window.windDirectionChartInstance) {
    window.windDirectionChartInstance.destroy();
  }

  window.windDirectionChartInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels: directions.map((dir, i) => `${dir} (${percentages[i]}%)`),
      datasets: [{
        data: counts,
        backgroundColor: [
          "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe",
          "#f87171", "#fca5a5", "#fcd34d", "#fbbf24"
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: { font: { size: 14 } }
        },
        tooltip: {
          callbacks: {
            label: context => {
              const dir = directions[context.dataIndex];
              const pct = percentages[context.dataIndex];
              const times = counts[context.dataIndex];
              return `${dir}: ${times} times (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

async function fetchWeatherByCoordinatesAndUpdateUI(lat, lon) {
  try {
    const res = await fetch(`${weatherUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);
    if (!res.ok) throw new Error("Weather fetch failed");

    const data = await res.json();
    // Update UI same way as in fetchWeatherByCity
    document.getElementById("cityName").textContent = `${data.name}, ${data.sys.country}`;
    document.getElementById("temp").textContent = `${Math.round(data.main.temp)} °C`;
    document.getElementById("weatherDesc").textContent = data.weather[0].description;
    document.getElementById("mainWeatherIcon").src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    document.getElementById("mainWeatherIcon").style.display = "block";
    document.getElementById("sunrise").textContent = new Date(data.sys.sunrise * 1000).toLocaleTimeString();
    document.getElementById("sunset").textContent = new Date(data.sys.sunset * 1000).toLocaleTimeString();
    document.getElementById("windSpeed").textContent = `${data.wind.speed} m/s`;

    // Update map and AQI
    updateMap(lat, lon);
    fetchAQIAndSetUI(lat, lon);

    // Fetch 5-day forecast & charts
    await fetchForecastByCoords(lat, lon);  
  } catch (err) {
    console.error(err);
  }
}

function getWindDirection(deg) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.floor((deg + 22.5) / 45) % 8]; 
}


// Geolocation logic
function askCityFallback() {
  let city = prompt("⚠️ Unable to get GPS location.\nPlease type your city:");
  if (!city) city = "Ahmedabad"; // default
  fetchWeatherByCity(city);
}

// Geolocation logic
if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    position => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      console.log("📍 Device location detected:", lat, lon);

      initMap(lat, lon);
      fetchWeatherByCoordinatesAndUpdateUI(lat, lon);
    },
    error => {
      console.warn("Geolocation failed:", error.message);
      askCityFallback(); // fallback if GPS fails
    },
    {
      enableHighAccuracy: true,  // try phone GPS
      timeout: 10000,            // max wait 10s
      maximumAge: 0              // no cached position
    }
  );
} else {
  console.warn("Geolocation not supported on this device/browser.");
  askCityFallback(); // fallback if unsupported
}



function initMap(lat = 20, lon = 0) {
  if (!map) {
    map = L.map("map").setView([lat, lon], 4);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    precipitationLayer = L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}`, { attribution: "© OpenWeatherMap" });
    cloudsLayer = L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${apiKey}`, { attribution: "© OpenWeatherMap" });

    precipLayerCheckbox?.addEventListener("change", (e) => {
      if (e.target.checked) precipitationLayer.addTo(map); else precipitationLayer.remove();
    });
    cloudsLayerCheckbox?.addEventListener("change", (e) => {
      if (e.target.checked) cloudsLayer.addTo(map); else cloudsLayer.remove();
    });
  }
}

function updateMap(lat, lon) {
  if (map) {
    map.setView([lat, lon], 8);
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lon]).addTo(map);
  } else {
    initMap(lat, lon);
  }
}

async function fetchWeatherByCity(city) {
  if (!city) return;
  try {
    const res = await fetch(`${weatherUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
    if (!res.ok) throw new Error(`Weather API error ${res.status}`);

    const data = await res.json();

    // --- Update UI ---
    const cityNameEl = document.getElementById("cityName");
    const tempEl = document.getElementById("temp");
    const weatherDescEl = document.getElementById("weatherDesc");
    const humidityEl = document.getElementById("humidity");
    const sunriseEl = document.getElementById("sunrise");
    const sunsetEl = document.getElementById("sunset");
    const windSpeedEl = document.getElementById("windSpeed");
    const iconEl = document.getElementById("mainWeatherIcon");

    if (cityNameEl) cityNameEl.textContent = `${data.name}, ${data.sys.country}`;
    if (tempEl) tempEl.textContent = `${Math.round(data.main.temp * 10) / 10} °C`;
    if (weatherDescEl) weatherDescEl.textContent = data.weather[0].description;
    if (humidityEl) humidityEl.textContent = `Humidity: ${data.main.humidity}%`;
    if (sunriseEl) sunriseEl.textContent = new Date(data.sys.sunrise * 1000).toLocaleTimeString();
    if (sunsetEl) sunsetEl.textContent = new Date(data.sys.sunset * 1000).toLocaleTimeString();
    if (windSpeedEl) windSpeedEl.textContent = `${data.wind.speed} m/s`;
    if (iconEl && data.weather[0].icon) {
      iconEl.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
      iconEl.style.display = "block";
      iconEl.alt = data.weather[0].description;
    } else if (iconEl) {
      iconEl.style.display = "none";
    }

    // --- Map & AQI ---
    const lat = data.coord.lat;
    const lon = data.coord.lon;
    updateMap(lat, lon);
    fetchAQIAndSetUI(lat, lon);

    // --- Forecast ---
    const resForecast = await fetch(`${forecastUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
    if (!resForecast.ok) {
      console.warn("Forecast API failed:", resForecast.status);
      forecastContainer.innerHTML = "<p>Forecast not available</p>";
      [forecastChart, humidityChart, windChart].forEach(chart => chart?.destroy());
      return;
    }

    const forecastData = await resForecast.json();
    let dailySummary = aggregateForecast3hToDaily(forecastData);

    // Attach current AQI to each day
    try {
      const aqiRes = await fetch(`${airPollutionUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}`);
      const aqiJson = await aqiRes.json();
      const currentAQI = aqiJson?.list?.[0]?.main?.aqi || null;
      dailySummary = dailySummary.map(d => ({ ...d, aqi: currentAQI }));
    } catch (err) {
      console.warn("AQI fetch for forecast failed:", err);
    }

    // --- Charts ---
    const dailyForCharts = dailySummary.map(d => ({
      date: d.date,
      tempDay: d.tempDay,
      humidity: d.humidity,
      wind_speed: d.wind_speed,
      wind: { deg: d.wind_deg || 0, speed: d.wind_speed } // ensure wind exists
    }));

    renderDetailedCharts(dailyForCharts);

    // Wind direction chart expects objects with .wind.deg
    createWindDirectionChart(dailyForCharts);

    // Render forecast UI
    renderForecast(dailySummary);

  } catch (err) {
    console.error("fetchWeatherByCity error:", err);
    alert("Error fetching weather: " + err.message);
  }
}


// -----------------------
// Compare cities
async function fetchCityWeather(city) {
  const res = await fetch(`${weatherUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
  if (!res.ok) throw new Error(`City "${city}" not found (${res.status})`);
  return await res.json();
}
async function compareCities(cityA, cityB) {
  try {
    const [dataA, dataB] = await Promise.all([fetchCityWeather(cityA), fetchCityWeather(cityB)]);
    compareResults.innerHTML = `
      <div class="card">
        <h4>${dataA.name}</h4>
        <p>🌡 ${Math.round(dataA.main.temp * 10) / 10} °C</p>
        <p>💧 ${dataA.main.humidity}% Humidity</p>
        <p>🌬 ${dataA.wind.speed} m/s</p>
      </div>
      <div class="card">
        <h4>${dataB.name}</h4>
        <p>🌡 ${Math.round(dataB.main.temp * 10) / 10} °C</p>
        <p>💧 ${dataB.main.humidity}% Humidity</p>
        <p>🌬 ${dataB.wind.speed} m/s</p>
      </div>
    `;
    if (compareChart) compareChart.destroy();
    compareChart = new Chart(compareChartCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: ["Temperature (°C)", "Humidity (%)", "Wind (m/s)"],
        datasets: [
          { label: dataA.name, data: [Math.round(dataA.main.temp * 10) / 10, dataA.main.humidity, dataA.wind.speed], backgroundColor: "rgba(54, 162, 235, 0.6)" },
          { label: dataB.name, data: [Math.round(dataB.main.temp * 10) / 10, dataB.main.humidity, dataB.wind.speed], backgroundColor: "rgba(255, 99, 132, 0.6)" }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: "top" } } }
    });
  } catch (err) {
    alert(err.message);
  }
}

// -----------------------
// Chatbot behavior
function appendChat(sender, text) {
  const bubble = document.createElement("div");
  bubble.style.margin = "6px 0";
  bubble.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatBody.appendChild(bubble);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function extractCityFromText(text) {
  const cleaned = text.toLowerCase().replace(/[^a-z\s]/gi, "").trim();
  const words = cleaned.split(" ");

  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = words[i];
    if (candidate.length >= 3) return candidate;
  }
  return null;
}

function getPackingTips(weatherDesc) {
  const desc = weatherDesc.toLowerCase();
  if (desc.includes("rain")) return "🌧️ It's rainy—pack an umbrella, raincoat, and waterproof shoes.";
  if (desc.includes("snow")) return "❄️ Snowy conditions—bring warm clothes, gloves, and boots.";
  if (desc.includes("clear") || desc.includes("sun")) return "☀️ Sunny weather—pack light clothes, sunglasses, and sunscreen.";
  if (desc.includes("cloud")) return "⛅ Cloudy skies—carry a light jacket just in case.";
  return "🧳 Pack essentials and check the forecast for updates.";
}

async function handleAQIQueryForCity(city) {
  if (!city) { appendChat("Bot", "Please include a city name, e.g. 'AQI in Los Angeles'."); return; }
  appendChat("Bot", `Checking AQI for ${city}...`);
  try {
    const res = await fetch(`${weatherUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
    if (!res.ok) throw new Error("City not found for AQI check");
    const info = await res.json();
    const lat = info.coord.lat, lon = info.coord.lon;
    const aqiText = await fetchAQIText(lat, lon);
    appendChat("Bot", `${city}: ${aqiText}`);
  } catch (err) {
    appendChat("Bot", `Sorry, couldn't fetch AQI for ${city}. (${err.message})`);
  }
}

async function fetchForecast(city) {
  try {
    await fetchWeatherByCity(city); 

    const res = await fetch(`${weatherUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
    if (!res.ok) throw new Error("City not found");
    const info = await res.json();
    const lat = info.coord.lat, lon = info.coord.lon;

    const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);
    const forecastData = await forecastRes.json();

    const dailySummary = aggregateForecast3hToDaily(forecastData);
    const days = dailySummary.map(day => {
      return `${new Date(day.date).toLocaleDateString()}: ${day.weatherDesc}, Temp: ${day.tempDay}°C`;
    });

    appendChat("Bot", `📅 5-day forecast for ${city}:\n` + days.join("\n"));
  } catch (err) {
    appendChat("Bot", `Couldn't fetch forecast for ${city}. (${err.message})`);
  }
}
async function checkTravelSafety(city) {
  try {
    const res = await fetch(`${weatherUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
    if (!res.ok) throw new Error("City not found");
    const info = await res.json();
    const lat = info.coord.lat, lon = info.coord.lon;

    const alertsRes = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily&appid=${apiKey}`);
    const alertsData = await alertsRes.json();

    if (alertsData.alerts && alertsData.alerts.length > 0) {
      const warning = alertsData.alerts[0];
      appendChat("Bot", ` Travel warning for ${city}: ${warning.event} - ${warning.description}`);
    } else {
      appendChat("Bot", `No weather alerts for ${city}. It's safe to travel.`);
    }
  } catch (err) {
    appendChat("Bot", `Couldn't check travel safety for ${city}. (${err.message})`);
  }
}

function getBotReply(msgRaw) {
  const msg = (msgRaw || "").toLowerCase();
  const city = extractCityFromText(msgRaw);

  // Forecast
  if (msg.includes("forecast") || msg.includes("next week")) {
    if (city) {
      fetchWeatherByCity(city);
      fetchForecast(city);
      return `Fetching 5-day forecast for ${city}...`;
    }
    return "Please tell me the city (e.g., 'forecast for Shimla').";
  }

  // AQI
  if (msg.includes("aqi") || msg.includes("air quality")) {
    if (city) {
      handleAQIQueryForCity(city);
      return `I'll check the air quality for ${city}...`;
    }
    return "Please include a city name for AQI check.";
  }

  // Weather
  if (msg.includes("weather in") || msg.includes("weather")) {
    if (city) {
      fetchWeatherByCity(city);
      return `Fetching weather for ${city}...`;
    }
    return "Please tell me the city (e.g., 'weather in Paris').";
  }

  // Packing tips
function getPackingTips(weatherDesc, temp) {
  weatherDesc = weatherDesc.toLowerCase();
  
  // Rainy weather
  if (weatherDesc.includes("rain") || weatherDesc.includes("drizzle") || weatherDesc.includes("thunderstorm")) {
    return "Bring an umbrella, raincoat, and waterproof shoes.";
  }

  // Cold / winter weather
  if (weatherDesc.includes("snow") || weatherDesc.includes("cold") || temp <= 15) {
    return "Pack warm clothes: sweaters, heavy jackets, gloves, and scarves.";
  }

  // Hot / summer weather
  if (weatherDesc.includes("hot") || weatherDesc.includes("sunny") || temp >= 25) {
    return "Pack light clothes, cotton outfits, sunglasses, and sunscreen.";
  }

  // Default
  return "Pack comfortable clothes suitable for the weather.";
}

// --- Chatbot packing check ---
if (
  msg.includes("pack") ||
  msg.includes("packing") ||
  msg.includes("what to pack") ||
  msg.includes("carry") ||
  msg.includes("bring")
) {
  if (city) {
    fetch(`${weatherUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`)
      .then(res => res.json())
      .then(data => {
        const weatherDesc = data.weather?.[0]?.description || "unknown";
        const temp = data.main?.temp || 20; // fallback temperature
        const tips = getPackingTips(weatherDesc, temp);
        appendChat("Bot", `🧳 Packing tips for ${city}: ${weatherDesc}, ${Math.round(temp)}°C. ${tips}`);
      })
      .catch(() => appendChat("Bot", `Couldn't fetch weather for ${city}.`));
    return `Fetching packing tips for ${city}...`;
  }
  return "Please tell me the city so I can give you packing tips based on the weather.";
}

  // Compare cities
  if (msg.includes("compare")) {
    const parts = msgRaw.split(/and|vs|vs\.|compare/i).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const a = extractCityFromText(parts[0]) || parts[0];
      const b = extractCityFromText(parts[1]) || parts[1];
      compareCities(a, b);
      return `Comparing ${a} and ${b}...`;
    }
    return "To compare, write something like: 'Compare London and New York'.";
  }

  // --- Travel destination suggestions ---
if (
  msg.includes("suggest") ||
  msg.includes("recommend") ||
  msg.includes("where should i go") ||
  msg.includes("spot") ||
  msg.includes("place")
) {
  // Summer / hot destinations
  if (msg.includes("summer") || msg.includes("hot")) {
    appendChat("Bot", "☀️ For a sunny summer vacation, you can visit: Goa, Jaipur, Bali, or Dubai.");
    return;
  }

  // Winter / cold destinations
  if (msg.includes("winter") || msg.includes("cold")) {
    appendChat("Bot", "❄️ For a cold winter getaway, try: Manali, Shimla, Leh-Ladakh, or Zermatt.");
    return;
  }

  // Rainy / monsoon destinations
  if (msg.includes("rainy") || msg.includes("monsoon")) {
    appendChat("Bot", "🌧️ For a refreshing rainy destination, consider: Munnar, Cherrapunji, Lonavala, or Seattle.");
    return;
  }

  // Default fallback if type not mentioned
  appendChat("Bot", "🌍 Could you tell me what type of destination you’re looking for — summer, winter, or rainy?");
  return;
}

// 🛡️ Travel safety 
if (msg.includes("safe to travel") || msg.includes("travel risk")) {
  if (city) {
    fetch(`${weatherUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`)
      .then(res => res.json())
      .then(async data => {
        if (!data.coord) {
          appendChat("Bot", `I couldn’t check travel safety for ${city}.`);
          return;
        }

        const { lat, lon } = data.coord;

        // Fetch AQI
        let aqiVal = null;
        try {
          const aqiRes = await fetch(`${airPollutionUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}`);
          const aqiData = await aqiRes.json();
          aqiVal = aqiData?.list?.[0]?.main?.aqi || null;
        } catch {
          aqiVal = null;
        }

        // Build advice based on AQI value
        let aqiAdvice = "";
        if (aqiVal === 1) aqiAdvice = "🟢 Air quality is good — very safe to travel.";
        else if (aqiVal === 2) aqiAdvice = "🟡 Air quality is fair — safe to travel, but sensitive people should stay cautious.";
        else if (aqiVal === 3) aqiAdvice = "🟠 Air quality is moderate — okay for most, but people with respiratory issues should take precautions.";
        else if (aqiVal === 4) aqiAdvice = "🔴 Air quality is poor — consider delaying travel or wear a mask outdoors.";
        else if (aqiVal === 5) aqiAdvice = "🟣 Air quality is very poor — not safe for outdoor activities, avoid travel if possible.";
        else aqiAdvice = "AQI data unavailable — check local updates before travelling.";

        // Also check if there are any weather alerts
        let alertMessage = "";
        try {
          const alertsRes = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily&appid=${apiKey}`);
          const alertsData = await alertsRes.json();

          if (alertsData.alerts && alertsData.alerts.length > 0) {
            const warning = alertsData.alerts[0];
            alertMessage = `Weather alert: ${warning.event} - ${warning.description}`;
          } else {
            alertMessage = " No major weather alerts at the moment.";
          }
        } catch {
          alertMessage = "Could not retrieve weather alerts.";
        }

        appendChat("Bot", `Travel safety for ${city}:\n${aqiAdvice}\n${alertMessage}`);
      })
      .catch(() => {
        appendChat("Bot", `I couldn’t fetch travel safety info for ${city}.`);
      });

    return `Checking travel safety for ${city}...`;
  }
  return "Please include a city name so I can check travel safety.";
}

  // Default fallback
  return "Hey there 👋 I'm your travel buddy. I can help with weather updates, forecasts, air quality, travel tips, and packing suggestions!";
}

// UI and event wiring remains unchanged
function openChatbot() {
  chatbotEl.style.display = "flex";
  chatMessage.focus();
}
function closeChatbot() {
  chatbotEl.style.display = "none";
}
function sendChat() {
  const msg = chatMessage.value.trim();
  if (!msg) return;
  appendChat("You", msg);
  chatMessage.value = "";
  const botReply = getBotReply(msg);
  if (botReply) appendChat("Bot", botReply);
}

getWeatherBtn.addEventListener("click", () => fetchWeatherByCity(cityInput.value));
cityInput.addEventListener("keypress", (e) => { if (e.key === "Enter") fetchWeatherByCity(cityInput.value); });

runCompareBtn?.addEventListener("click", () => {
  const a = compareCityA.value.trim(), b = compareCityB.value.trim();
  if (!a || !b) { alert("Please enter both cities to compare."); return; }
  compareCities(a, b);
});

openChatbotBtn?.addEventListener("click", openChatbot);
chatMessage?.addEventListener("keypress", (e) => { if (e.key === "Enter") sendChat(); });

if (closeForecastModal) {
  closeForecastModal.addEventListener("click", () => { forecastModal.style.display = "none"; });
}
window.addEventListener("click", (e) => {
  if (e.target === forecastModal) forecastModal.style.display = "none";
});



function initAll() {
  initMap();
  resizeCharts();
  resizeMap();
  resizeChatbot();
  adjustChatInput();
  console.log("Script loaded. Ready.");
}


function resizeCharts() {
  [forecastChart, humidityChart, windChart, compareChart].forEach(chart => {
    if (chart) chart.resize();
  });
}

const chartOptions = {
  animation: {
    duration: 1000,
    easing: "easeOutQuart"
  },
  responsive: true,
  maintainAspectRatio: false
};

// -----------------------
// Map Resizing
// -----------------------
function resizeMap() {
  if (map) map.invalidateSize();
}

// -----------------------
// Chatbot Responsive Height
// -----------------------
function resizeChatbot() {
  if (!chatbotEl) return;

  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  if (screenWidth <= 600) {
    chatbotEl.style.maxHeight = Math.floor(screenHeight * 0.65) + "px";
    chatbotEl.style.width = "95%";
    chatbotEl.style.right = "2.5%";
    chatbotEl.style.bottom = "10px";
  } else if (screenWidth <= 1024) {
    chatbotEl.style.maxHeight = Math.floor(screenHeight * 0.6) + "px";
    chatbotEl.style.width = "400px";
    chatbotEl.style.right = "20px";
    chatbotEl.style.bottom = "20px";
  } else {
    chatbotEl.style.maxHeight = "440px";
    chatbotEl.style.width = "360px";
    chatbotEl.style.right = "20px";
    chatbotEl.style.bottom = "20px";
  }
}

// -----------------------
// Chat Input Stickiness
// -----------------------
function adjustChatInput() {
  if (!chatbotEl) return;

  const screenWidth = window.innerWidth;
  const chatInput = chatbotEl.querySelector(".chat-input");
  if (!chatInput) return;

  if (screenWidth <= 600) {
    chatInput.style.position = "sticky";
    chatInput.style.bottom = "0";
    chatInput.style.background = "#fff";
    chatInput.style.zIndex = "10";
  } else {
    chatInput.style.position = "";
    chatInput.style.bottom = "";
    chatInput.style.background = "";
    chatInput.style.zIndex = "";
  }
}

// -----------------------
// Event Listeners
// -----------------------
window.addEventListener("load", initAll);
window.addEventListener("resize", () => {
  resizeCharts();
  resizeMap();
  resizeChatbot();
  adjustChatInput();
});
