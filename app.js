
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    STORAGE_BUCKET
} from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);

const accessibilityFeatureNames = {
    step_free_entrance: "Вхід без сходинок",
    ramp: "Є пандус",
    accessible_toilet: "Доступний туалет",
    wide_passage: "Широкий прохід",
    elevator: "Є ліфт"
};

const categoryNames = {
    food: "Заклад харчування",
    shop: "Магазин",
    culture: "Культура",
    health: "Медицина",
    public: "Громадський простір",
    other: "Інше"
};

// Завантаження каталогу
async function loadPlaces() {
    const target = document.querySelector("#places");
    if (!target) return;

    const msg = document.querySelector("#message");

    const { data, error } = await supabase
        .from("places")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        msg.textContent = "Не вдалося завантажити каталог. Перевірте налаштування Supabase.";
        console.error(error);
        return;
    }

    let activeStatus = "";

    const render = () => {
        const q = document.querySelector("#search")
            .value.trim().toLocaleLowerCase("uk");

        const cat = document.querySelector("#category").value;

        const rows = data.filter((p) =>
            (`${p.name} ${p.address}`)
                .toLocaleLowerCase("uk")
                .includes(q) &&
            (!activeStatus || p.status === activeStatus) &&
            (!cat || p.category === cat)
        );

        target.innerHTML = rows.map((p) => {
            const photo = p.photo_path
                ? supabase.storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(p.photo_path).data.publicUrl
                : "";

            return `
                <article class="place-card">
                    <div class="place-image-wrap">
                        ${
                            photo
                                ? `<img
                                    class="place-image"
                                    src="${esc(photo)}"
                                    alt="${esc(p.photo_alt)}"
                                    loading="lazy"
                                >`
                                : `<div class="photo-placeholder">⌖</div>`
                        }

                        <span class="status-pill ${
                            p.status === "accessible"
                                ? "status-positive"
                                : "status-negative"
                        }">
                            ${
                                p.status === "accessible"
                                    ? "✓ Вдале рішення"
                                    : "! Невдале рішення"
                            }
                        </span>
                    </div>

                    <div class="place-content">
                        ${
                            p.category
                                ? `<p class="category-label">${
                                    esc(categoryNames[p.category] || p.category)
                                }</p>`
                                : ""
                        }

                        <h3>${esc(p.name)}</h3>
                        <p class="place-description">${esc(p.description)}</p>
                        ${
                            Array.isArray(p.accessibility_features) &&
                            p.accessibility_features.length
                                ? `<div class="accessibility-features">
                                    <h4>Характеристики доступності</h4>
                                    <ul>
                                        ${p.accessibility_features
                                            .filter((feature) => accessibilityFeatureNames[feature])
                                            .map((feature) => `
                                                <li>${esc(accessibilityFeatureNames[feature])}</li>
                                            `).join("")}
                                    </ul>
                                </div>`
                                : ""
                        }
                        <div class="place-address">
                            ⌖
                            ${
                                p.maps_url
                                    ? `<a
                                        href="${esc(p.maps_url)}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="address-link"
                                    >${esc(p.address)}</a>`
                                    : `<span>${esc(p.address)}</span>`
                            }
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        msg.innerHTML = rows.length
            ? `Знайдено прикладів: <strong>${rows.length}</strong>`
            : `
                <div class="empty-state">
                    <span class="empty-icon">⌕</span>
                    <h3>${data.length ? "Нічого не знайдено" : "Каталог поки порожній"}</h3>
                    <p>
                        ${
                            data.length
                                ? "Спробуйте змінити пошук або фільтри."
                                : "Додайте перший приклад доступності у Львові."
                        }
                    </p>
                </div>
            `;
    };

    document.querySelector("#search").addEventListener("input", render);
    document.querySelector("#category").addEventListener("change", render);

    document.querySelectorAll(".filter-tab").forEach((button) => {
        button.addEventListener("click", () => {
            activeStatus = button.dataset.status;

            document.querySelectorAll(".filter-tab").forEach((item) => {
                item.classList.toggle("active", item === button);
            });

            render();
        });
    });

    render();
}

// Форма додавання місця
function setupForm() {
    const form = document.querySelector("#place-form");
    if (!form) return;

    const desc = form.querySelector('[name="description"]');
    const photoInput = form.querySelector('[name="photo"]');
    const msg = document.querySelector("#form-message");
    const btn = form.querySelector('button[type="submit"]');

    desc.addEventListener("input", () => {
        document.querySelector("#description-count").textContent =
            `${desc.value.length}/3000`;
    });

    photoInput.addEventListener("change", (event) => {
        document.querySelector("#file-name").textContent =
            event.target.files[0]?.name || "Оберіть фотографію";
    });

    form.querySelectorAll('input[name="status"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            form.querySelectorAll(".choice-card").forEach((card) => {
                card.classList.toggle(
                    "selected",
                    card.querySelector("input").checked
                );
            });
        });
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const file = formData.get("photo");
        const captchaToken = formData.get("cf-turnstile-response");
        const latitude = formData.get("latitude");
        const longitude = formData.get("longitude");
        
        if (!latitude || !longitude) {
            msg.textContent = "Оберіть адресу зі списку підказок.";
            document.querySelector("#address").focus();
            return;
        }

        if (!(file instanceof File) || !file.size) {
            msg.textContent = "Додайте фотографію.";
            return;
        }

        if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 5 * 1024 * 1024
        ) {
            msg.textContent = "Фото має бути JPG, PNG або WebP до 5 МБ.";
            return;
        }

        if (!captchaToken) {
            msg.textContent = "Підтвердіть, що ви не робот.";
            return;
        }

        btn.disabled = true;
        msg.textContent = "Надсилаємо ваш приклад…";

        try {
            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/add-place`,
                {
                    method: "POST",
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
                    },
                    body: formData
                }
            );

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    result.message ||
                    `Помилка сервера: ${response.status}`
                );
            }

            form.reset();

            document.querySelector("#file-name").textContent =
                "Оберіть фотографію";

            document.querySelector("#description-count").textContent =
                "0/3000";

            form.querySelectorAll(".choice-card").forEach((card) => {
                card.classList.remove("selected");
            });

            if (window.turnstile) {
                window.turnstile.reset();
            }

            msg.textContent =
                "Дякуємо! Приклад успішно надіслано";

        } catch (error) {
            console.error("Помилка надсилання:", error);

            msg.textContent =
                `Не вдалося надіслати: ${error.message || "невідома помилка"}`;

            if (window.turnstile) {
                window.turnstile.reset();
            }
        } finally {
            btn.disabled = false;
        }
    });
}

/* ADDRESS AUTOCOMPLETE */

function setupAddressSearch() {
    const addressInput = document.querySelector("#address");
    const suggestions = document.querySelector("#address-suggestions");
    const message = document.querySelector("#address-message");
    const latitudeInput = document.querySelector("#latitude");
    const longitudeInput = document.querySelector("#longitude");

    if (
        !addressInput ||
        !suggestions ||
        !message ||
        !latitudeInput ||
        !longitudeInput
    ) return;

    const LVIV_CENTER = {
        lat: 49.8397,
        lon: 24.0297
    };

    // Попередня географічна область пошуку Львова
    const LVIV_BBOX = [
        23.90,
        49.75,
        24.15,
        49.90
    ];

    let searchTimeout = null;
    let requestController = null;
    let selectedAddress = false;

    function clearSelection() {
        latitudeInput.value = "";
        longitudeInput.value = "";
        selectedAddress = false;
    }

    function hideSuggestions() {
        suggestions.innerHTML = "";
        suggestions.hidden = true;
    }

    function getAddressLabel(properties) {
        const street = properties.street || properties.name || "";
        const house = properties.housenumber || "";
        const district = properties.district || "";

        return [
            [street, house].filter(Boolean).join(", "),
            district,
            "Львів"
        ].filter(Boolean).join(", ");
    }

    async function searchAddress(query) {
        if (requestController) {
            requestController.abort();
        }

        requestController = new AbortController();

        const params = new URLSearchParams({
            q: `${query}, Lviv, Ukraine`,
            limit: "7",
            lang: "default",
            bbox: LVIV_BBOX.join(","),
            countrycode: "UA",
            lat: String(LVIV_CENTER.lat),
            lon: String(LVIV_CENTER.lon)
        });

        try {
            message.textContent = "Шукаємо адресу…";

            const response = await fetch(
                `https://photon.komoot.io/api/?${params}`,
                {
                    signal: requestController.signal
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            const results = (data.features || []).filter((feature) => {
                const coordinates = feature.geometry?.coordinates;

                if (!Array.isArray(coordinates)) return false;

                const [lon, lat] = coordinates;

                return (
                    Number.isFinite(lon) &&
                    Number.isFinite(lat) &&
                    lon >= LVIV_BBOX[0] &&
                    lon <= LVIV_BBOX[2] &&
                    lat >= LVIV_BBOX[1] &&
                    lat <= LVIV_BBOX[3] &&
                    String(feature.properties?.countrycode || "")
                        .toUpperCase() === "UA"
                );
            });

            hideSuggestions();

            if (!results.length) {
                message.textContent =
                    "Адресу не знайдено. Спробуйте ввести назву вулиці та номер будинку.";
                return;
            }

            results.forEach((feature) => {
                const properties = feature.properties;
                const button = document.createElement("button");

                button.type = "button";
                button.className = "address-suggestion";
                button.textContent = getAddressLabel(properties);

                button.addEventListener("click", () => {
                    const [lon, lat] = feature.geometry.coordinates;

                    addressInput.value = getAddressLabel(properties);
                    latitudeInput.value = String(lat);
                    longitudeInput.value = String(lon);

                    selectedAddress = true;
                    hideSuggestions();

                    message.textContent =
                        "Адресу обрано. Можна надсилати форму.";
                });

                suggestions.appendChild(button);
            });

            suggestions.hidden = false;
            message.textContent = "Оберіть адресу зі списку.";

        } catch (error) {
            if (error.name === "AbortError") return;

            console.error("Address search error:", error);

            message.textContent =
                "Не вдалося виконати пошук. Спробуйте ще раз трохи пізніше.";
        }
    }

    addressInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        clearSelection();
        hideSuggestions();

        const query = addressInput.value.trim();

        if (query.length < 3) {
            message.textContent =
                "Введіть щонайменше 3 символи адреси.";
            return;
        }

        searchTimeout = setTimeout(() => {
            searchAddress(query);
        }, 600);
    });

    addressInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            hideSuggestions();
        }
    });

    document.addEventListener("click", (event) => {
        if (
            !suggestions.contains(event.target) &&
            event.target !== addressInput
        ) {
            hideSuggestions();
        }
    });

    // Не дозволяємо залишити адресу без вибору підказки
    addressInput.addEventListener("change", () => {
        if (!selectedAddress) {
            clearSelection();
        }
    });

    message.textContent =
        "Введіть адресу у Львові та оберіть її зі списку.";
}

loadPlaces();
setupAddressSearch();
setupForm();


function setupContrastMode() {
    const button = document.querySelector("#contrast-toggle");
    if (!button) return;

    const applyContrast = (enabled) => {
        document.body.classList.toggle("high-contrast", enabled);

        button.setAttribute("aria-pressed", String(enabled));
        button.textContent = enabled
            ? "Звичайний режим"
            : "Високий контраст";
    };

    const savedMode = localStorage.getItem("high-contrast") === "true";

    applyContrast(savedMode);

    button.addEventListener("click", () => {
        const enabled = !document.body.classList.contains("high-contrast");

        localStorage.setItem("high-contrast", String(enabled));
        applyContrast(enabled);
    });
}

setupContrastMode();
