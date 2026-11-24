import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    STORAGE_BUCKET
} from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

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

/* CATALOG */

async function loadPlaces() {
    const target = document.querySelector("#places");
    if (!target) return;

    const message = document.querySelector("#message");

    const { data, error } = await supabase
        .from("places")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        if (message) {
            message.textContent =
                "Не вдалося завантажити каталог. Перевірте налаштування Supabase.";
        }
        console.error("Supabase loadPlaces error:", error);
        return;
    }

    const places = data || [];
    let activeStatus = "";

    const render = () => {
        const searchInput = document.querySelector("#search");
        const categoryInput = document.querySelector("#category");

        const query = (searchInput?.value || "")
            .trim()
            .toLocaleLowerCase("uk");

        const category = categoryInput?.value || "";

        const rows = places.filter((place) =>
            (`${place.name || ""} ${place.address || ""}`)
                .toLocaleLowerCase("uk")
                .includes(query) &&
            (!activeStatus || place.status === activeStatus) &&
            (!category || place.category === category)
        );

        target.innerHTML = rows.map((place) => {
            const photo = place.photo_path
                ? supabase.storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(place.photo_path).data.publicUrl
                : "";

            const features = Array.isArray(place.accessibility_features)
                ? place.accessibility_features
                    .filter((feature) => accessibilityFeatureNames[feature])
                    .map((feature) => `<li>${esc(accessibilityFeatureNames[feature])}</li>`)
                    .join("")
                : "";

            return `
                <article class="place-card">
                    <div class="place-image-wrap">
                        ${
                            photo
                                ? `<img class="place-image"
                                    src="${esc(photo)}"
                                    alt="${esc(place.photo_alt)}"
                                    loading="lazy">`
                                : `<div class="photo-placeholder">⌖</div>`
                        }
                        <span class="status-pill ${
                            place.status === "accessible"
                                ? "status-positive"
                                : "status-negative"
                        }">
                            ${
                                place.status === "accessible"
                                    ? "✓ Вдале рішення"
                                    : "! Невдале рішення"
                            }
                        </span>
                    </div>
                    <div class="place-content">
                        ${
                            place.category
                                ? `<p class="category-label">${
                                    esc(categoryNames[place.category] || place.category)
                                }</p>`
                                : ""
                        }
                        <h3>${esc(place.name)}</h3>
                        <p class="place-description">${esc(place.description)}</p>
                        ${
                            features
                                ? `<div class="accessibility-features">
                                    <h4>Характеристики доступності</h4>
                                    <ul>${features}</ul>
                                </div>`
                                : ""
                        }
                        <div class="place-address">
                            ⌖
                            ${
                                place.maps_url
                                    ? `<a href="${esc(place.maps_url)}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="address-link">${esc(place.address)}</a>`
                                    : `<span>${esc(place.address)}</span>`
                            }
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        if (message) {
            message.innerHTML = rows.length
                ? `Знайдено прикладів: <strong>${rows.length}</strong>`
                : `
                    <div class="empty-state">
                        <span class="empty-icon">⌕</span>
                        <h3>${places.length ? "Нічого не знайдено" : "Каталог поки порожній"}</h3>
                        <p>${
                            places.length
                                ? "Спробуйте змінити пошук або фільтри."
                                : "Додайте перший приклад доступності у Львові."
                        }</p>
                    </div>
                `;
        }
    };

    document.querySelector("#search")?.addEventListener("input", render);
    document.querySelector("#category")?.addEventListener("change", render);

    document.querySelectorAll(".filter-tab").forEach((button) => {
        button.addEventListener("click", () => {
            activeStatus = button.dataset.status || "";

            document.querySelectorAll(".filter-tab").forEach((item) => {
                item.classList.toggle("active", item === button);
            });

            render();
        });
    });

    render();
}

/* ADDRESS AUTOCOMPLETE */

function setupAddressSearch() {
    const addressInput = document.querySelector("#address");
    const suggestions = document.querySelector("#address-suggestions");
    const message = document.querySelector("#address-message");
    const latitudeInput = document.querySelector("#latitude");
    const longitudeInput = document.querySelector("#longitude");

    if (!addressInput) return;

    if (!suggestions || !message || !latitudeInput || !longitudeInput) {
        console.error("Address autocomplete: не знайдені всі потрібні HTML-елементи.", {
            suggestions: !!suggestions,
            message: !!message,
            latitude: !!latitudeInput,
            longitude: !!longitudeInput
        });
        return;
    }

    const LVIV_CENTER = { lat: 49.8397, lon: 24.0297 };

    // Прямокутна область попереднього пошуку; це не остаточна межа міста.
    const LVIV_BBOX = [23.90, 49.75, 24.15, 49.90];

    let debounceTimer;
    let activeController;
    let selectedAddress = false;

    const setMessage = (text) => {
        message.textContent = text;
    };

    const clearCoordinates = () => {
        latitudeInput.value = "";
        longitudeInput.value = "";
        selectedAddress = false;
    };

    const closeSuggestions = () => {
        suggestions.replaceChildren();
        suggestions.hidden = true;
    };

    const makeAddressLabel = (properties = {}) => {
        const street = properties.street || properties.name || "";
        const house = properties.housenumber || "";
        const district = properties.district || properties.city_district || "";

        const streetAndHouse = [street, house].filter(Boolean).join(", ");
        return [streetAndHouse, district, "Львів"].filter(Boolean).join(", ");
    };

    async function searchAddress(query) {
        if (activeController) activeController.abort();
        activeController = new AbortController();

        const params = new URLSearchParams({
            q: `${query}, Lviv, Ukraine`,
            limit: "7",
            lang: "default",
            bbox: LVIV_BBOX.join(","),
            countrycode: "UA",
            lat: String(LVIV_CENTER.lat),
            lon: String(LVIV_CENTER.lon)
        });

        setMessage("Шукаємо адресу…");

        try {
            const response = await fetch(
                `https://photon.komoot.io/api/?${params.toString()}`,
                {
                    method: "GET",
                    headers: { Accept: "application/json" },
                    signal: activeController.signal
                }
            );

            if (!response.ok) {
                throw new Error(`Photon повернув HTTP ${response.status}`);
            }

            const payload = await response.json();

            const results = (payload.features || []).filter((feature) => {
                const coordinates = feature.geometry?.coordinates;
                if (!Array.isArray(coordinates) || coordinates.length < 2) {
                    return false;
                }

                const [longitude, latitude] = coordinates;
                const countryCode = String(
                    feature.properties?.countrycode || ""
                ).toUpperCase();

                return (
                    Number.isFinite(longitude) &&
                    Number.isFinite(latitude) &&
                    longitude >= LVIV_BBOX[0] &&
                    longitude <= LVIV_BBOX[2] &&
                    latitude >= LVIV_BBOX[1] &&
                    latitude <= LVIV_BBOX[3] &&
                    countryCode === "UA"
                );
            });

            closeSuggestions();

            if (!results.length) {
                setMessage(
                    "Адресу не знайдено. Спробуйте назву вулиці та номер будинку."
                );
                return;
            }

            for (const feature of results) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "address-suggestion";
                button.textContent = makeAddressLabel(feature.properties);

                button.addEventListener("click", () => {
                    const [longitude, latitude] = feature.geometry.coordinates;

                    addressInput.value = makeAddressLabel(feature.properties);
                    latitudeInput.value = String(latitude);
                    longitudeInput.value = String(longitude);
                    selectedAddress = true;

                    closeSuggestions();
                    setMessage("Адресу обрано. Можна надсилати форму.");
                });

                suggestions.append(button);
            }

            suggestions.hidden = false;
            setMessage("Оберіть адресу зі списку.");

        } catch (error) {
            if (error.name === "AbortError") return;

            console.error("Address autocomplete error:", error);
            closeSuggestions();
            setMessage(
                "Не вдалося виконати пошук адреси. Спробуйте ще раз трохи пізніше."
            );
        }
    }

    addressInput.addEventListener("input", () => {
        window.clearTimeout(debounceTimer);
        clearCoordinates();
        closeSuggestions();

        const query = addressInput.value.trim();

        if (query.length < 3) {
            setMessage("Введіть щонайменше 3 символи адреси.");
            return;
        }

        debounceTimer = window.setTimeout(() => {
            searchAddress(query);
        }, 500);
    });

    addressInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSuggestions();
    });

    document.addEventListener("click", (event) => {
        if (
            !suggestions.contains(event.target) &&
            event.target !== addressInput
        ) {
            closeSuggestions();
        }
    });

    addressInput.addEventListener("change", () => {
        if (!selectedAddress) clearCoordinates();
    });

    setMessage("Введіть адресу у Львові та оберіть її зі списку.");

    console.info("Address autocomplete initialized.");
}

/* ADD PLACE FORM */

function setupForm() {
    const form = document.querySelector("#place-form");
    if (!form) return;

    const description = form.querySelector('[name="description"]');
    const photoInput = form.querySelector('[name="photo"]');
    const message = document.querySelector("#form-message");
    const submitButton = form.querySelector('button[type="submit"]');

    description?.addEventListener("input", () => {
        const counter = document.querySelector("#description-count");
        if (counter) counter.textContent = `${description.value.length}/3000`;
    });

    photoInput?.addEventListener("change", (event) => {
        const fileName = document.querySelector("#file-name");
        if (fileName) {
            fileName.textContent =
                event.target.files[0]?.name || "Оберіть фотографію";
        }
    });

    form.querySelectorAll('input[name="status"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            form.querySelectorAll(".choice-card").forEach((card) => {
                const cardRadio = card.querySelector('input[name="status"]');
                card.classList.toggle("selected", !!cardRadio?.checked);
            });
        });
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!message || !submitButton) return;

        const formData = new FormData(form);
        const file = formData.get("photo");
        const captchaToken = formData.get("cf-turnstile-response");
        const latitude = formData.get("latitude");
        const longitude = formData.get("longitude");

        if (!latitude || !longitude) {
            message.textContent = "Оберіть адресу зі списку підказок.";
            document.querySelector("#address")?.focus();
            return;
        }

        if (!(file instanceof File) || !file.size) {
            message.textContent = "Додайте фотографію.";
            return;
        }

        if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 5 * 1024 * 1024
        ) {
            message.textContent = "Фото має бути JPG, PNG або WebP до 5 МБ.";
            return;
        }

        if (!captchaToken) {
            message.textContent = "Підтвердіть, що ви не робот.";
            return;
        }

        submitButton.disabled = true;
        message.textContent = "Надсилаємо ваш приклад…";

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

            const fileName = document.querySelector("#file-name");
            const descriptionCount = document.querySelector("#description-count");
            const addressMessage = document.querySelector("#address-message");
            const suggestions = document.querySelector("#address-suggestions");

            if (fileName) fileName.textContent = "Оберіть фотографію";
            if (descriptionCount) descriptionCount.textContent = "0/3000";
            if (addressMessage) {
                addressMessage.textContent =
                    "Введіть адресу у Львові та оберіть її зі списку.";
            }
            if (suggestions) {
                suggestions.replaceChildren();
                suggestions.hidden = true;
            }

            form.querySelectorAll(".choice-card").forEach((card) => {
                card.classList.remove("selected");
            });

            window.turnstile?.reset();
            message.textContent = "Дякуємо! Приклад успішно надіслано.";

        } catch (error) {
            console.error("Помилка надсилання форми:", error);
            message.textContent =
                `Не вдалося надіслати: ${error.message || "невідома помилка"}`;
            window.turnstile?.reset();
        } finally {
            submitButton.disabled = false;
        }
    });
}

/* HIGH CONTRAST */

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

    let savedMode = false;
    try {
        savedMode = localStorage.getItem("high-contrast") === "true";
    } catch (error) {
        console.warn("Не вдалося прочитати налаштування контрасту:", error);
    }

    applyContrast(savedMode);

    button.addEventListener("click", () => {
        const enabled = !document.body.classList.contains("high-contrast");

        try {
            localStorage.setItem("high-contrast", String(enabled));
        } catch (error) {
            console.warn("Не вдалося зберегти налаштування контрасту:", error);
        }

        applyContrast(enabled);
    });
}

/* INITIALIZATION */

function initializeApp() {
    console.info("app.js: initializeApp запущено");

    setupAddressSearch();
    setupForm();
    setupContrastMode();

    loadPlaces().catch((error) => {
        console.error("Помилка ініціалізації каталогу:", error);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
    initializeApp();
}
