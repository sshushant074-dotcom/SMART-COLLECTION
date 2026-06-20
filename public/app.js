// ==========================================================================
// Fullstack State Management (Server API synced)
// ==========================================================================

let products = [];
let orders = [];
let reviews = [];
let exchanges = [];
let cart = JSON.parse(localStorage.getItem("smart_collection_cart")) || [];
let currentCategoryFilter = "all";
let currentEventFilter = "all";
let currentTheme = localStorage.getItem("smart_collection_theme") || "light";
let salesChart = null;
let currentSalesTimescale = "daily";
let currentCustomer = JSON.parse(localStorage.getItem("currentCustomer")) || null;
let redeemLoyaltyChecked = false;
let flashSaleSettings = null;
let flashSaleInterval = null;
let banners = [];
let bundles = [];
let bundleSettings = null;
let currentSelectedBundle = null;
let paymentScreenshotBase64 = "";

// Mannequin Avatars SVG definition
const AVATARS = {
  boy: `<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="25" r="12" fill="var(--text-muted)" opacity="0.6"/>
    <path d="M50,38 L50,48 M42,42 L58,42" stroke="var(--text-muted)" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
    <path d="M35,48 L65,48 L60,100 L40,100 Z" fill="var(--bg-accent)" stroke="var(--border)" stroke-width="2"/>
    <path d="M40,100 L45,130 L49,130 L49,100 Z M51,100 L51,130 L55,130 L60,100 Z" fill="var(--text-muted)" opacity="0.4"/>
    <text x="50" y="75" fill="var(--text-muted)" font-size="8" font-weight="700" text-anchor="middle" opacity="0.5">KIDS MANNEQUIN</text>
  </svg>`,
  girl: `<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="20" r="10" fill="var(--text-muted)" opacity="0.6"/>
    <path d="M50,30 L50,38 M45,34 L55,34" stroke="var(--text-muted)" stroke-width="3" opacity="0.6"/>
    <path d="M38,38 L62,38 L55,65 L45,65 Z" fill="var(--bg-accent)" stroke="var(--border)" stroke-width="2"/>
    <path d="M45,65 L55,65 L70,125 L30,125 Z" fill="var(--bg-accent)" stroke="var(--border)" stroke-width="2"/>
    <path d="M47,125 L47,140 M53,125 L53,140" stroke="var(--text-muted)" stroke-width="2" opacity="0.4"/>
    <text x="50" y="85" fill="var(--text-muted)" font-size="8" font-weight="700" text-anchor="middle" opacity="0.5">GIRLS MANNEQUIN</text>
  </svg>`,
  man: `<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="22" r="12" fill="var(--text-muted)" opacity="0.6"/>
    <path d="M50,34 L50,42 M40,38 L60,38" stroke="var(--text-muted)" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
    <path d="M30,42 L70,42 L64,95 L36,95 Z" fill="var(--bg-accent)" stroke="var(--border)" stroke-width="2"/>
    <path d="M36,95 L40,140 L47,140 L48,95 Z M52,95 L53,140 L60,140 L64,95 Z" fill="var(--text-muted)" opacity="0.4"/>
    <text x="50" y="70" fill="var(--text-muted)" font-size="8" font-weight="700" text-anchor="middle" opacity="0.5">MEN MANNEQUIN</text>
  </svg>`
};

let activeAvatar = "boy";
let activeGarmentProduct = null;
let currentRatingSelection = 5;
let currentEditingProductId = null;
let currentEditingView = 'front';
let currentModalProduct = null;
let currentModalImages = [];
let currentModalImageIndex = 0;

// Cart saving helpers
function saveCart() { localStorage.setItem("smart_collection_cart", JSON.stringify(cart)); }

// Customer session saving helper (prevents localStorage quota exceeded by stripping heavy wishlist items)
function saveCustomerSession(customer) {
  if (!customer) {
    localStorage.removeItem("currentCustomer");
    return;
  }
  const stripped = {
    ...customer,
    wishlist: customer.wishlist ? customer.wishlist.map(item => (typeof item === 'string' ? item : (item._id || item))) : []
  };
  try {
    localStorage.setItem("currentCustomer", JSON.stringify(stripped));
  } catch (err) {
    console.error("Failed to save customer session:", err);
  }
}

// ==========================================================================
// API Interaction Calls (fetch wrapper)
// ==========================================================================

async function fetchFromApi(endpoint, options = {}) {
  try {
    let url = endpoint;
    const method = options.method || 'GET';
    if (method.toUpperCase() === 'GET') {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}_t=${Date.now()}`;
    }

    const reqHeaders = { 'Content-Type': 'application/json' };
    if (typeof currentCustomer !== 'undefined' && currentCustomer) {
      reqHeaders['X-Operator'] = `${currentCustomer.name} (${currentCustomer.phone || currentCustomer.email || currentCustomer._id})`;
    } else {
      reqHeaders['X-Operator'] = 'System/Guest';
    }
    if (options.headers) {
      Object.assign(reqHeaders, options.headers);
    }

    const res = await fetch(url, {
      ...options,
      headers: reqHeaders
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Server request failed');
    }
    return await res.json();
  } catch (err) {
    console.error(`API Fetch Error [${endpoint}]:`, err.message);
    throw err;
  }
}

async function loadAllData() {
  try {
    products = await fetchFromApi('/api/products');
    orders = await fetchFromApi('/api/orders');
    reviews = await fetchFromApi('/api/reviews');
    exchanges = await fetchFromApi('/api/exchanges');
    
    // Sync customer profile if logged in
    if (currentCustomer) {
      try {
        const updatedCustomer = await fetchFromApi(`/api/customers/${currentCustomer.phone || currentCustomer._id}`);
        if (updatedCustomer) {
          currentCustomer = updatedCustomer;
          saveCustomerSession(currentCustomer);
        }
      } catch (err) {
        console.error("Failed to auto-sync customer profile:", err);
      }
    }
    
    // Fetch flash sale settings
    try {
      flashSaleSettings = await fetchFromApi('/api/flash-sale/settings');
    } catch (err) {
      console.error("Failed to load flash sale settings:", err);
    }

    // Fetch banners
    try {
      banners = await fetchFromApi('/api/banners');
    } catch (err) {
      console.error("Failed to load banners:", err);
    }

    // Fetch bundles and settings
    try {
      bundles = await fetchFromApi('/api/bundles');
      bundleSettings = await fetchFromApi('/api/bundles/settings');
    } catch (err) {
      console.error("Failed to load bundles and settings:", err);
    }

    // Refresh storefront views
    renderStorefrontBanners();
    renderFeaturedProducts();
    renderFlashSaleProducts();
    initFlashSaleTimer();
    applyFilters(); // Re-apply active filters and render shop products correctly
    initTryOnGarments();
    renderHistory();
    updateCartUI();
    updateAdminStats();
    renderAdminInventory();
    renderAdminOrders();
    renderAdminExchanges();
    renderAdminReviews();
    renderAdminCustomers();
    renderAdminAnalytics();
    renderAdminFlashSaleProducts();
    renderAdminBanners();
    
    // Render Outfit Bundles storefront & admin
    renderStorefrontBundles();
    populateMixAndMatchDropdowns();
    renderAdminBundles();
    populateAdminBundleProductSelects();
    populateAdminBundleSettings();

    syncCustomerUI();
    renderWishlistTab();
    renderRecentlyViewed();

    // Check if a specific product is shared via query param (e.g., QR Code)
    const urlParams = new URLSearchParams(window.location.search);
    const sharedProductId = urlParams.get("p");
    if (sharedProductId) {
      const match = products.find(p => p._id === sharedProductId);
      if (match) {
        // Wait briefly for UI layout to settle, then open product detail modal
        setTimeout(() => openProductModal(sharedProductId), 100);
      }
    }
  } catch (err) {
    console.error("Error loading storefront data:", err);
    alert("Error loading data from fullstack backend. Please check if your MongoDB and Node.js server are active.");
  }
}

// ==========================================================================
// Progressive Web App (PWA) Setup
// ==========================================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('👷 [PWA] Service Worker registered successfully with scope:', reg.scope);
        checkPwaInstallState();
      })
      .catch(err => console.error('👷 [PWA] Service Worker registration failed:', err));
  });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.style.display = 'flex';
  }
});

window.addEventListener('appinstalled', () => {
  console.log('👷 [PWA] App installed successfully');
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.style.display = 'none';
  }
});

function checkPwaInstallState() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    if (isStandalone) {
      installBtn.style.display = 'none';
    } else {
      installBtn.style.display = 'flex'; // show installation options by default on mobile
    }
  }
}

function showPwaInstallationInstructions() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // Create modal markup dynamically
  const modalHtml = `
    <div class="modal-backdrop active" id="pwaInstructionsModal" onclick="closePwaInstructions()" style="background-color: rgba(0,0,0,0.6); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); display: flex; justify-content: center; align-items: center;">
      <div class="modal-container" style="max-width: 400px; text-align: center; padding: 25px; border-radius: 16px; margin: 15px; box-sizing: border-box;" onclick="event.stopPropagation()">
        <div style="font-size: 3rem; margin-bottom: 12px;">📲</div>
        <h3 style="margin: 0 0 10px 0; font-size: 1.25rem; font-weight: 800; color: var(--primary); text-transform: uppercase;">Install App</h3>
        <p style="margin: 0 0 20px 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.45;">
          Add Smart Collection to your home screen for instant access, offline shopping, and better performance!
        </p>
        
        <div style="background-color: var(--bg-accent); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 20px; font-size: 0.85rem; box-sizing: border-box;">
          ${isIOS ? `
            <strong style="color: var(--text); display: block; margin-bottom: 8px;"><i class="fa-brands fa-apple" style="color: var(--primary);"></i> iPhone / iPad (Safari):</strong>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.6; color: var(--text-muted);">
              <li>Tap the <strong>Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket" style="color: var(--primary); margin: 0 2px;"></i> inside Safari's menu.</li>
              <li>Scroll down and select <strong>Add to Home Screen</strong> <i class="fa-regular fa-square-plus" style="color: var(--primary); margin: 0 2px;"></i>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner to complete!</li>
            </ol>
          ` : `
            <strong style="color: var(--text); display: block; margin-bottom: 8px;"><i class="fa-brands fa-chrome" style="color: var(--primary);"></i> Android / Windows:</strong>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.6; color: var(--text-muted);">
              <li>Tap your browser's menu (three dots <i class="fa-solid fa-ellipsis-vertical" style="margin: 0 2px;"></i>) at the top or bottom.</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
              <li>Confirm the download to add the app to your device!</li>
            </ol>
          `}
        </div>
        
        <button class="btn btn-primary btn-large" onclick="closePwaInstructions()" style="width: 100%; border-radius: 50px; min-height: 40px; font-weight: 700;">Got It</button>
      </div>
    </div>
  `;
  
  // Remove existing modal if any
  closePwaInstructions();
  
  // Append modal to body
  const div = document.createElement('div');
  div.id = 'pwaInstructionsContainer';
  div.innerHTML = modalHtml;
  document.body.appendChild(div);
}

function closePwaInstructions() {
  const container = document.getElementById('pwaInstructionsContainer');
  if (container) {
    container.remove();
  }
}

// ==========================================================================
// Initialization & Events Loaders
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Bind PWA install button click event
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`👷 [PWA] Install prompt outcome: ${outcome}`);
        deferredPrompt = null;
        installBtn.style.display = 'none';
      } else {
        showPwaInstallationInstructions();
      }
    });
  }

  initTheme();
  loadAllData();
  selectAvatar("boy");
  checkAdminAuthState();
  initDraggableGarment();
  initializeGoogleSignIn();
  initSearchSuggestions();
  initHeroSlider();

  // Setup theme toggle event
  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);

  // Setup admin category change default sizes placeholder update
  const prodCategorySelect = document.getElementById("prodCategory");
  if (prodCategorySelect) {
    prodCategorySelect.addEventListener("change", (e) => {
      const cat = e.target.value;
      const sizesInput = document.getElementById("prodSizes");
      if (sizesInput) {
        if (cat === "children") sizesInput.placeholder = "e.g. 2-3Y, 4-5Y, 5-6Y";
        else if (cat === "girls") sizesInput.placeholder = "e.g. S, M, L, XL";
        else sizesInput.placeholder = "e.g. S, M, L, XL, XXL";
      }
    });
  }
});

// ==========================================================================
// Hero Slider & Mobile Menu & Search Portal Sync Actions
// ==========================================================================
let currentHeroSlideIndex = 0;
let heroSliderInterval = null;

function renderStorefrontBanners() {
  const slider = document.getElementById("heroSlider");
  const dotsContainer = document.getElementById("sliderDots");
  if (!slider || !dotsContainer) return;

  const activeBanners = banners.filter(b => b.isActive);
  if (activeBanners.length === 0) {
    slider.innerHTML = `
      <div class="hero-slide active" style="background-image: linear-gradient(135deg, #1f1f2e, #0a0a0f); width: 100%;">
        <div class="hero-content">
          <span class="hero-subtitle">Smart Collection</span>
          <h2 class="hero-title">Welcome to Smart Collection</h2>
          <p class="hero-description">Discover a curated collection of beautiful ready-made apparel for Men, Girls, and Children.</p>
          <div class="hero-cta-group">
            <button class="btn btn-primary btn-large" onclick="showTab('shop')">Explore Shop <i class="fa-solid fa-arrow-right"></i></button>
          </div>
        </div>
      </div>
    `;
    dotsContainer.innerHTML = '';
    slider.style.width = '100%';
    currentHeroSlideIndex = 0;
    setHeroSlide(0);
    return;
  }

  const N = activeBanners.length;
  slider.style.width = `${N * 100}%`;

  let slidesHtml = '';
  let dotsHtml = '';

  activeBanners.forEach((banner, index) => {
    let ctaAction = `showTab('${banner.ctaTab || 'shop'}')`;
    if (banner.categoryFilter) {
      ctaAction = `filterShopByCategory('${banner.categoryFilter}')`;
    }

    const bannerImage = (banner.image.startsWith('data:') || banner.image.startsWith('images/')) 
      ? banner.image 
      : `images/fashion_banner_2.png`;

    slidesHtml += `
      <div class="hero-slide ${index === currentHeroSlideIndex ? 'active' : ''}" style="background-image: url('${bannerImage}'); width: ${100 / N}%;">
        <div class="hero-content">
          <span class="hero-subtitle">${banner.subtitle || ''}</span>
          <h2 class="hero-title">${banner.title}</h2>
          <p class="hero-description">${banner.description || ''}</p>
          <div class="hero-cta-group">
            <button class="btn btn-primary btn-large" onclick="${ctaAction}">${banner.ctaText || 'Explore Shop'} <i class="fa-solid fa-arrow-right"></i></button>
          </div>
        </div>
      </div>
    `;

    dotsHtml += `
      <span class="slider-dot ${index === currentHeroSlideIndex ? 'active' : ''}" onclick="setHeroSlide(${index})"></span>
    `;
  });

  slider.innerHTML = slidesHtml;
  dotsContainer.innerHTML = dotsHtml;

  if (currentHeroSlideIndex >= N) {
    currentHeroSlideIndex = 0;
  }
  setHeroSlide(currentHeroSlideIndex);
}

function initHeroSlider() {
  const slider = document.getElementById("heroSlider");
  if (!slider) return;
  renderStorefrontBanners();
}

function startHeroSliderAutoplay() {
  stopHeroSliderAutoplay();
  heroSliderInterval = setInterval(() => {
    moveHeroSlide(1);
  }, 6000);
}

function stopHeroSliderAutoplay() {
  if (heroSliderInterval) {
    clearInterval(heroSliderInterval);
    heroSliderInterval = null;
  }
}

function moveHeroSlide(offset) {
  const slides = document.querySelectorAll(".hero-slide");
  if (slides.length === 0) return;
  let newIndex = currentHeroSlideIndex + offset;
  if (newIndex >= slides.length) {
    newIndex = 0;
  } else if (newIndex < 0) {
    newIndex = slides.length - 1;
  }
  setHeroSlide(newIndex);
}

function setHeroSlide(index) {
  currentHeroSlideIndex = index;
  const slider = document.getElementById("heroSlider");
  if (!slider) return;
  const slides = document.querySelectorAll(".hero-slide");
  const translationFactor = 100 / (slides.length || 1);
  slider.style.transform = `translateX(-${index * translationFactor}%)`;
  const dots = document.querySelectorAll(".slider-dot");
  dots.forEach((dot, idx) => {
    if (idx === index) {
      dot.classList.add("active");
    } else {
      dot.classList.remove("active");
    }
  });
  startHeroSliderAutoplay();
}

function toggleMobileMenu(show) {
  const overlay = document.getElementById("mobileMenuOverlay");
  const drawer = document.getElementById("mobileMenuDrawer");
  if (overlay && drawer) {
    if (show) {
      overlay.classList.add("active");
      drawer.classList.add("active");
    } else {
      overlay.classList.remove("active");
      drawer.classList.remove("active");
    }
  }
}

function handleMobileNavLinkClick(tabName) {
  toggleMobileMenu(false);
  showTab(tabName);
}

function handleNavbarSearch(event) {
  const query = event.target.value;
  const desktopSearch = document.getElementById("navbarSearchInput");
  const mobileSearch = document.getElementById("mobileSearchInput");
  
  if (desktopSearch && desktopSearch !== event.target) {
    desktopSearch.value = query;
  }
  if (mobileSearch && mobileSearch !== event.target) {
    mobileSearch.value = query;
  }
  
  showTab("shop");
  const shopSearch = document.getElementById("shopSearchInput");
  if (shopSearch) {
    shopSearch.value = query;
    shopSearch.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// Theme Logic
function initTheme() {
  const body = document.body;
  const themeBtnIcon = document.querySelector("#themeToggleBtn i");
  if (currentTheme === "dark") {
    body.classList.remove("light-theme");
    body.classList.add("dark-theme");
    themeBtnIcon.className = "fa-solid fa-sun";
  } else {
    body.classList.remove("dark-theme");
    body.classList.add("light-theme");
    themeBtnIcon.className = "fa-solid fa-moon";
  }
}

function toggleTheme() {
  const body = document.body;
  const themeBtnIcon = document.querySelector("#themeToggleBtn i");
  if (body.classList.contains("light-theme")) {
    body.classList.remove("light-theme");
    body.classList.add("dark-theme");
    themeBtnIcon.className = "fa-solid fa-sun";
    currentTheme = "dark";
  } else {
    body.classList.remove("dark-theme");
    body.classList.add("light-theme");
    themeBtnIcon.className = "fa-solid fa-moon";
    currentTheme = "light";
  }
  localStorage.setItem("smart_collection_theme", currentTheme);
}

// SPA Routing
function showTab(tabName) {
  // Access control: Non-admins cannot open the admin section
  if (tabName === "admin") {
    const isAdmin = sessionStorage.getItem("smart_collection_admin_logged") === "true" || (currentCustomer && currentCustomer.role === "admin");
    if (!isAdmin) {
      alert("Access Denied: You do not have permission to view the Admin section.");
      showTab("home");
      return;
    }
  }

  const views = document.querySelectorAll(".tab-view");
  views.forEach(v => v.classList.remove("active"));

  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach(l => l.classList.remove("active"));

  // Sync mobile drawer links as well
  const mobLinks = document.querySelectorAll(".mobile-nav-link");
  mobLinks.forEach(l => l.classList.remove("active"));

  const activeView = document.getElementById(`tab-${tabName}`);
  if (activeView) activeView.classList.add("active");

  const activeLink = document.getElementById(`nav-${tabName}`);
  if (activeLink) activeLink.classList.add("active");

  const activeMobLink = document.getElementById(`mob-nav-${tabName}`);
  if (activeMobLink) activeMobLink.classList.add("active");

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabName === "admin") {
    checkAdminAuthState();
  }

  // Hide customer shopping widgets in Admin tab
  const cartWrapper = document.getElementById("floatingCartWrapper");
  if (cartWrapper) {
    if (tabName === "admin") {
      cartWrapper.style.setProperty("display", "none", "important");
    } else {
      cartWrapper.style.display = "";
    }
  }

  // Sync data whenever switching views
  loadAllData();
}

function openAdminLogin(event) {
  if (event) event.preventDefault();
  closeAuthModal();
  
  // Temporarily bypass the routing check to show the admin login card
  const views = document.querySelectorAll(".tab-view");
  views.forEach(v => v.classList.remove("active"));
  
  const activeView = document.getElementById("tab-admin");
  if (activeView) activeView.classList.add("active");
  
  const loginWrapper = document.getElementById("adminLoginWrapper");
  const dashboardContent = document.getElementById("adminDashboardContent");
  if (loginWrapper && dashboardContent) {
    loginWrapper.style.display = "flex";
    dashboardContent.style.display = "none";
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function checkAdminAuthState() {
  const isLoggedIn = sessionStorage.getItem("smart_collection_admin_logged") === "true" || (currentCustomer && currentCustomer.role === "admin");
  const loginWrapper = document.getElementById("adminLoginWrapper");
  const dashboardContent = document.getElementById("adminDashboardContent");

  if (loginWrapper && dashboardContent) {
    if (isLoggedIn) {
      loginWrapper.style.display = "none";
      dashboardContent.style.display = "block";
      // Initialize the default admin sub-tab on login
      showAdminSubTab('analytics');
    } else {
      loginWrapper.style.display = "flex";
      dashboardContent.style.display = "none";
    }
  }
}

function showAdminSubTab(subTabName) {
  const panels = [
    { name: 'analytics', selector: '.admin-analytics-panel' },
    { name: 'inventory', selector: '.admin-layout' },
    { name: 'banners', selector: '.admin-banners-panel' },
    { name: 'bundles', selector: '.admin-bundles-panel' },
    { name: 'flash-sales', selector: '.admin-flash-sales-panel' },
    { name: 'orders', selector: '.admin-orders-panel' },
    { name: 'customers', selector: '.admin-customers-panel' },
    { name: 'exchanges-reviews', selector: '.admin-dashboard-grids' },
    { name: 'audit-logs', selector: '.admin-audit-logs-panel' }
  ];

  panels.forEach(p => {
    const el = document.querySelector(p.selector);
    if (el) {
      if (p.name === subTabName) {
        el.style.display = (p.name === 'inventory' || p.name === 'exchanges-reviews') ? 'grid' : 'block';
      } else {
        el.style.display = 'none';
      }
    }
  });

  // Toggle active sub-tab buttons style dynamically
  panels.forEach(p => {
    const btn = document.getElementById(`btn-admin-tab-${p.name}`);
    if (btn) {
      if (p.name === subTabName) {
        btn.classList.add('active');
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('active');
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  });

  // Redraw Chart.js to fix canvas size calculation details or render specific panels
  if (subTabName === 'analytics') {
    renderAdminAnalytics();
  } else if (subTabName === 'audit-logs') {
    renderAdminAuditLogs();
  } else if (subTabName === 'flash-sales') {
    loadFlashSaleSettings();
    renderAdminFlashSaleProducts();
  } else if (subTabName === 'banners') {
    renderAdminBanners();
  } else if (subTabName === 'bundles') {
    renderAdminBundles();
    populateAdminBundleProductSelects();
    populateAdminBundleSettings();
  }
}

let adminAuditLogs = [];
let currentAuditFilter = 'all';
let auditLogsCurrentPage = 1;
const auditLogsPerPage = 10;
let lastAuditSearchQuery = "";

function setAuditLogFilter(filterType) {
  currentAuditFilter = filterType;
  auditLogsCurrentPage = 1;
  
  // Update button active state classes
  const filterTypes = ['all', 'stock', 'orders', 'customers', 'exchanges'];
  filterTypes.forEach(t => {
    const btn = document.getElementById(`btn-audit-filter-${t}`);
    if (btn) {
      if (t === filterType) {
        btn.classList.add('active');
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('active');
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  });
  
  filterAdminAuditLogs();
}

function changeAuditLogsPage(offset) {
  auditLogsCurrentPage += offset;
  filterAdminAuditLogs();
}

async function renderAdminAuditLogs() {
  const tableBody = document.getElementById("adminAuditLogsTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading audit logs...</td></tr>`;

  try {
    adminAuditLogs = await fetchFromApi('/api/audit-logs');
    auditLogsCurrentPage = 1;
    filterAdminAuditLogs();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--danger); padding: 20px;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading audit logs: ${err.message}</td></tr>`;
  }
}

function filterAdminAuditLogs() {
  const tableBody = document.getElementById("adminAuditLogsTableBody");
  if (!tableBody) return;

  const searchInput = document.getElementById("adminAuditLogSearchInput");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

  // Reset page if search query changed
  if (query !== lastAuditSearchQuery) {
    auditLogsCurrentPage = 1;
    lastAuditSearchQuery = query;
  }

  const filteredLogs = adminAuditLogs.filter(log => {
    const action = log.action || "";
    const details = log.details || "";
    const operator = log.operator || "";
    const timestampStr = new Date(log.timestamp).toLocaleString();
    
    // Category filtering
    if (currentAuditFilter !== 'all') {
      const actUpper = action.toUpperCase();
      if (currentAuditFilter === 'stock') {
        const isStock = actUpper.includes("STOCK") || actUpper.includes("PRICE") || actUpper.includes("NAME") || 
                        actUpper.includes("IMAGE") || actUpper.includes("SIZES") || actUpper.includes("DESC") || 
                        actUpper.includes("AVAILABILITY") || actUpper.includes("PRODUCT");
        if (!isStock) return false;
      } else if (currentAuditFilter === 'orders') {
        if (!actUpper.includes("ORDER")) return false;
      } else if (currentAuditFilter === 'customers') {
        if (!actUpper.includes("REVIEW") && !actUpper.includes("CUSTOMER")) return false;
      } else if (currentAuditFilter === 'exchanges') {
        if (!actUpper.includes("EXCHANGE")) return false;
      }
    }

    // Text search query filtering
    return (
      action.toLowerCase().includes(query) ||
      details.toLowerCase().includes(query) ||
      operator.toLowerCase().includes(query) ||
      timestampStr.toLowerCase().includes(query)
    );
  });

  const paginationContainer = document.getElementById("adminAuditLogsPagination");

  if (filteredLogs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-muted);">No matching audit logs found.</td></tr>`;
    if (paginationContainer) {
      paginationContainer.innerHTML = "";
    }
    return;
  }

  const totalPages = Math.ceil(filteredLogs.length / auditLogsPerPage) || 1;
  if (auditLogsCurrentPage > totalPages) {
    auditLogsCurrentPage = totalPages;
  }
  if (auditLogsCurrentPage < 1) {
    auditLogsCurrentPage = 1;
  }

  const startIndex = (auditLogsCurrentPage - 1) * auditLogsPerPage;
  const endIndex = startIndex + auditLogsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  if (paginationContainer) {
    paginationContainer.innerHTML = `
      <button class="btn btn-secondary btn-small" onclick="changeAuditLogsPage(-1)" ${auditLogsCurrentPage === 1 ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''} style="border-radius: 4px; padding: 6px 12px; font-weight: 600;">
        &lt;&lt; Previous
      </button>
      <span style="font-size: 0.9rem; font-weight: 600; margin: 0 10px;">Page ${auditLogsCurrentPage} of ${totalPages}</span>
      <button class="btn btn-secondary btn-small" onclick="changeAuditLogsPage(1)" ${auditLogsCurrentPage === totalPages ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''} style="border-radius: 4px; padding: 6px 12px; font-weight: 600;">
        Next &gt;&gt;
      </button>
    `;
  }

  tableBody.innerHTML = paginatedLogs.map(log => {
    let badgeStyle = "background-color: rgba(127, 140, 141, 0.12); color: #37474f; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
    let displayText = log.action || "";
    
    const action = log.action || "";
    if (action === "REVIEW_APPROVE" || action === "ORDER_STATUS_UPDATE" || action === "ORDER_APPROVED") {
      badgeStyle = "background-color: rgba(46, 204, 113, 0.12); color: #27ae60; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
      displayText = `🟢 ${action}`;
    } else if (action === "STOCK_UPDATE" || action === "PRICE_UPDATE" || action === "NAME_UPDATE" || action === "IMAGE_UPDATE" || action === "SIZES_UPDATE" || action === "SALE_PRICE_UPDATE" || action === "DESC_UPDATE" || action === "AVAILABILITY_TOGGLE") {
      badgeStyle = "background-color: rgba(243, 156, 18, 0.12); color: #d35400; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
      displayText = `🟡 ${action}`;
    } else if (action === "PRODUCT_CREATE" || action === "PRODUCT_ADDED" || action === "ORDER_CREATE" || action === "REVIEW_CREATE") {
      badgeStyle = "background-color: rgba(52, 152, 219, 0.12); color: #2980b9; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
      displayText = `🔵 ${action}`;
    } else if (action === "ORDER_CANCEL" || action === "ORDER_CANCELLED" || action === "ORDER_DELETE" || action === "PRODUCT_DELETE" || action === "REVIEW_DELETE") {
      badgeStyle = "background-color: rgba(231, 29, 54, 0.12); color: #c0392b; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
      displayText = `🔴 ${action}`;
    } else if (action === "EXCHANGE_REQUEST" || action === "EXCHANGE_DECISION" || action === "EXCHANGE_APPROVED") {
      badgeStyle = "background-color: rgba(155, 89, 182, 0.12); color: #8e44ad; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
      displayText = `🟣 ${action}`;
    } else {
      if (action.includes("APPROVE") || action.includes("DELIVER")) {
        badgeStyle = "background-color: rgba(46, 204, 113, 0.12); color: #27ae60; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
        displayText = `🟢 ${action}`;
      } else if (action.includes("UPDATE") || action.includes("TOGGLE")) {
        badgeStyle = "background-color: rgba(243, 156, 18, 0.12); color: #d35400; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
        displayText = `🟡 ${action}`;
      } else if (action.includes("CREATE") || action.includes("ADD")) {
        badgeStyle = "background-color: rgba(52, 152, 219, 0.12); color: #2980b9; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
        displayText = `🔵 ${action}`;
      } else if (action.includes("CANCEL") || action.includes("DELETE")) {
        badgeStyle = "background-color: rgba(231, 29, 54, 0.12); color: #c0392b; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
        displayText = `🔴 ${action}`;
      } else if (action.includes("EXCHANGE")) {
        badgeStyle = "background-color: rgba(155, 89, 182, 0.12); color: #8e44ad; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; display: inline-block; white-space: nowrap;";
        displayText = `🟣 ${action}`;
      } else {
        displayText = `⚪ ${action}`;
      }
    }

    const localTime = new Date(log.timestamp).toLocaleString();

    return `
      <tr>
        <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${localTime}</td>
        <td><span style="${badgeStyle}">${displayText}</span></td>
        <td style="font-weight: 500; color: var(--text);">${escapeHtml(log.details)}</td>
        <td style="color: var(--text-muted); font-size: 0.9rem;"><i class="fa-regular fa-user" style="margin-right: 5px;"></i> ${escapeHtml(log.operator)}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJsString(text) {
  if (!text) return "";
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function handleAdminLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  
  if (!usernameInput || !passwordInput) return;
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (username === "smart7575" && password === "Server@1234") {
    sessionStorage.setItem("smart_collection_admin_logged", "true");
    
    // Set admin identity in currentCustomer session
    currentCustomer = {
      name: "Sushant (Admin)",
      phone: "7575757575",
      email: "smart7575@gmail.com",
      role: "admin",
      _id: "admin-session"
    };
    localStorage.setItem("currentCustomer", JSON.stringify(currentCustomer));
    
    alert("🎉 Admin authenticated successfully!");
    
    usernameInput.value = "";
    passwordInput.value = "";
    
    syncCustomerUI();
    checkAdminAuthState();
    loadAllData();
  } else {
    alert("❌ Invalid Admin Username or Password.");
  }
}

async function mockGoogleSignIn(event) {
  if (event) event.preventDefault();
  const email = prompt("Enter mock Google Email:", "smart7575@gmail.com");
  if (!email) return;
  const name = prompt("Enter mock Google Display Name:", "Sushant Kumar");
  if (!name) return;
  
  // Construct a dummy JWT credential token (header.payload.signature)
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    sub: "mock-google-id-" + Math.random().toString(36).substring(7),
    email: email.trim(),
    name: name.trim(),
    picture: "https://lh3.googleusercontent.com/a/default-user=s96-c"
  }));
  const signature = "dummy-signature";
  const dummyCredential = `${header}.${payload}.${signature}`;
  
  try {
    await handleGoogleCredentialResponse({ credential: dummyCredential });
  } catch (err) {
    alert("Mock sign in failed: " + err.message);
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem("smart_collection_admin_logged");
  if (currentCustomer && currentCustomer.role === "admin") {
    currentCustomer = null;
    localStorage.removeItem("currentCustomer");
    syncCustomerUI();
    updateCartUI();
  }
  alert("🔓 Logged out of Admin Portal successfully.");
  checkAdminAuthState();
}

function filterShopByCategory(category) {
  showTab("shop");
  setCategoryFilter(category);
}

// ==========================================================================
// Catalog Rendering (Store Front)
// ==========================================================================

function renderFeaturedProducts() {
  const container = document.getElementById("featuredProductGrid");
  if (!container) return;
  
  const featured = products.filter(p => p.available).slice(0, 3);
  container.innerHTML = featured.map(p => generateProductCardMarkup(p)).join("");
  updateAllProductCardAddButtons();
}

function renderShopProducts(filteredProducts = products) {
  const container = document.getElementById("shopProductGrid");
  const countText = document.getElementById("shopResultsCount");
  if (!container) return;

  if (filteredProducts.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>No matching clothes found</h3>
        <p>Try resetting filters or search terms.</p>
      </div>`;
    if (countText) countText.textContent = "Showing 0 products";
    return;
  }

  container.innerHTML = filteredProducts.map(p => generateProductCardMarkup(p)).join("");
  if (countText) countText.textContent = `Showing ${filteredProducts.length} product${filteredProducts.length > 1 ? 's' : ''}`;
  updateAllProductCardAddButtons();
}

function selectProductCardSize(productId, size, btn) {
  const containers = document.querySelectorAll(`[data-sizes-for="${productId}"]`);
  containers.forEach(container => {
    const buttons = container.querySelectorAll(".size-select-btn");
    buttons.forEach(b => {
      if (b.textContent.trim() === size) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });
  });
  updateProductCardAddButtons(productId);
}

function getSelectedSizeForProduct(productId) {
  const activeBtn = document.querySelector(`[data-sizes-for="${productId}"] .size-select-btn.active`);
  return activeBtn ? activeBtn.textContent.trim() : null;
}

function renderCardImageThumbnails(p, dbId) {
  const views = [
    { key: 'front', url: p.image },
    { key: 'back', url: p.imageBack },
    { key: 'side', url: p.imageSide },
    { key: 'zoom', url: p.imageZoom }
  ].filter(v => v.url && v.url.trim() !== '');

  if (views.length <= 1) return '';

  return `
    <div class="card-thumbnails-tray">
      ${views.map((v, idx) => `
        <div class="card-thumbnail-item ${idx === 0 ? 'active' : ''}" 
             onmouseenter="switchCardImage('${dbId}', '${v.key}', this)"
             onclick="switchCardImage('${dbId}', '${v.key}', this)">
          <img src="${v.url}" alt="${v.key}">
        </div>
      `).join("")}
    </div>
  `;
}

function switchCardImage(productId, viewKey, thumbElement) {
  const card = thumbElement.closest('.product-card');
  if (card) {
    const stack = card.querySelectorAll('.card-main-img');
    stack.forEach(img => {
      if (img.id === `img-${productId}-${viewKey}`) {
        img.classList.add('active');
      } else {
        img.classList.remove('active');
      }
    });
  }
  const tray = thumbElement.parentElement;
  if (tray) {
    tray.querySelectorAll(".card-thumbnail-item").forEach(item => item.classList.remove("active"));
    thumbElement.classList.add("active");
  }
}

// Slideshow logic removed as requested by the user to avoid fast switching and flickering

function openProductModal(productId) {
  const p = products.find(prod => prod._id === productId);
  if (!p) return;

  currentModalProduct = p;
  trackRecentlyViewed(productId);

  // Reset Product Share QR container
  const shareContainer = document.getElementById("productShareQrContainer");
  if (shareContainer) shareContainer.style.display = "none";
  const shareImage = document.getElementById("productShareQrImage");
  if (shareImage) shareImage.innerHTML = "";

  // Reset Size Advisor container and inputs
  const sizeAdvisorContainer = document.getElementById("sizeAdvisorContainer");
  if (sizeAdvisorContainer) {
    sizeAdvisorContainer.style.display = "none";
  }
  const advisorAge = document.getElementById("advisorAge");
  if (advisorAge) advisorAge.value = "";
  const advisorHeight = document.getElementById("advisorHeight");
  if (advisorHeight) advisorHeight.value = "";
  const advisorWeight = document.getElementById("advisorWeight");
  if (advisorWeight) advisorWeight.value = "";
  const advisorResult = document.getElementById("advisorResult");
  if (advisorResult) {
    advisorResult.style.display = "none";
    advisorResult.innerHTML = "";
  }

  currentModalImages = [
    p.image,
    p.imageBack,
    p.imageSide,
    p.imageZoom
  ].filter(url => url && url.trim() !== '');

  currentModalImageIndex = 0;

  // Populate basic textual details
  document.getElementById("productModalName").textContent = p.name;
  document.getElementById("productModalDesc").textContent = p.desc;
  
  const priceEl = document.getElementById("productModalPrice");
  if (priceEl) {
    if (p.salePrice && p.salePrice < p.price) {
      const pct = Math.round(((p.price - p.salePrice) / p.price) * 100);
      priceEl.innerHTML = `₹${p.salePrice} <span style="text-decoration: line-through; color: var(--text-muted); font-size: 1.1rem; margin-left: 8px; font-weight: 500;">₹${p.price}</span> <span class="badge" style="background-color: #2ec4b6; margin-left: 10px; font-size: 0.8rem; font-weight: 700;">${pct}% OFF</span>`;
    } else {
      priceEl.textContent = `₹${p.price}`;
    }
  }

  // Badge Category
  const badge = document.getElementById("productModalBadge");
  if (badge) {
    badge.textContent = p.category === 'children' ? 'Small Children' : p.category === 'girls' ? 'Girls' : 'Men';
    badge.className = `badge ${p.category === 'children' ? 'badge-kids' : p.category === 'girls' ? 'badge-girls' : 'badge-men'}`;
  }

  // Badge Event
  const eventBadge = document.getElementById("productModalEventBadge");
  if (eventBadge) {
    if (p.event) {
      const eventLabels = {
        birthday: "🎂 Birthday Party",
        wedding: "💒 Wedding",
        festival: "🎉 Festival",
        school: "🏫 School Function",
        office: "👔 Office Wear"
      };
      eventBadge.textContent = eventLabels[p.event] || p.event;
      eventBadge.style.display = "inline-block";
    } else {
      eventBadge.style.display = "none";
    }
  }

  // Stock Status
  const stockEl = document.getElementById("productModalStock");
  if (stockEl) {
    const inStock = p.stock > 0 && p.available;
    stockEl.textContent = !inStock ? 'Out of Stock' : p.stock < 5 ? `Only ${p.stock} left!` : 'In Stock';
    stockEl.className = `stock-status ${!inStock ? 'status-out-of-stock' : p.stock < 5 ? 'status-low-stock' : 'status-in-stock'}`;
    
    // Disable Add To Cart button if out of stock
    const cartBtn = document.getElementById("productModalAddToCartBtn");
    if (cartBtn) {
      cartBtn.disabled = !inStock;
      cartBtn.innerHTML = inStock ? `Add to Cart <i class="fa-solid fa-cart-plus"></i>` : 'Out of Stock';
      cartBtn.onclick = () => {
        addToCart(p._id);
        closeProductModal();
      };
    }
  }

  // Populate Sizes list
  const sizesContainer = document.getElementById("productModalSizes");
  if (sizesContainer) {
    const sizes = (p.sizes && p.sizes.length > 0) ? p.sizes : 
                  (p.category === 'children' ? ['2-3Y', '4-5Y', '5-6Y'] : 
                   p.category === 'girls' ? ['S', 'M', 'L', 'XL'] : 
                   ['S', 'M', 'L', 'XL', 'XXL']);

    const currentSelectedSize = getSelectedSizeForProduct(p._id) || sizes[0];

    sizesContainer.innerHTML = sizes.map(sz => `
      <button class="size-select-btn ${sz === currentSelectedSize ? 'active' : ''}" onclick="selectModalSize('${sz}', this)">
        ${sz}
      </button>
    `).join("");
  }

  // Populate thumbnails
  const thumbsContainer = document.getElementById("productModalThumbs");
  if (thumbsContainer) {
    thumbsContainer.innerHTML = currentModalImages.map((url, idx) => `
      <div class="card-thumbnail-item ${idx === 0 ? 'active' : ''}" onclick="selectModalImage(${idx}, this)">
        <img src="${url}" alt="View ${idx + 1}">
      </div>
    `).join("");
  }

  // Load approved reviews for this product
  const modalReviewsContainer = document.getElementById("productModalReviewsList");
  if (modalReviewsContainer) {
    const productReviews = reviews.filter(r => r.approved && (r.productId === p._id || r.productId === p.name || r.productName === p.name));
    
    if (productReviews.length === 0) {
      modalReviewsContainer.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; margin: 0; padding: 5px 0;">No reviews yet for this clothing item.</p>`;
    } else {
      modalReviewsContainer.innerHTML = productReviews.map(r => {
        let stars = "";
        for (let i = 1; i <= 5; i++) {
          stars += i <= r.rating ? `<i class="fa-solid fa-star" style="color: #f59f00;"></i>` : `<i class="fa-regular fa-star" style="color: var(--text-muted);"></i>`;
        }
        return `
          <div style="background-color: var(--bg-accent); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.85rem; border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 700; color: var(--text);">${stars}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${r.date}</span>
            </div>
            <p style="color: var(--text-muted); font-style: italic; margin: 0;">"${r.comment}"</p>
          </div>
        `;
      }).join("");
    }
  }

  // Set main image, render AI recommendations and open backdrop
  renderAIRecommendations(p);
  updateModalSliderImage();

  // Update Modal Wishlist button
  const wishlistBtn = document.getElementById("productModalWishlistBtn");
  if (wishlistBtn) {
    const isWishlisted = currentCustomer && currentCustomer.wishlist && currentCustomer.wishlist.some(item => {
      const id = item._id || item;
      return id.toString() === p._id.toString();
    });

    if (isWishlisted) {
      wishlistBtn.classList.add("active");
      wishlistBtn.innerHTML = `<i class="fa-solid fa-heart" style="color: #e71d36;"></i> Wishlisted`;
      wishlistBtn.title = "Remove from Wishlist";
    } else {
      wishlistBtn.classList.remove("active");
      wishlistBtn.innerHTML = `<i class="fa-regular fa-heart"></i> Wishlist`;
      wishlistBtn.title = "Add to Wishlist";
    }
    
    wishlistBtn.onclick = async (e) => {
      e.stopPropagation();
      await toggleWishlist(p._id);
      openProductModal(p._id);
    };
  }

  document.getElementById("productModalBackdrop").classList.add("active");
}

async function toggleShareQrCode() {
  if (!currentModalProduct) return;
  const container = document.getElementById("productShareQrContainer");
  const imgBox = document.getElementById("productShareQrImage");
  if (!container || !imgBox) return;

  if (container.style.display === "flex") {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  imgBox.innerHTML = `
    <div style="width: 150px; height: 150px; display: flex; align-items: center; justify-content: center;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
    </div>
  `;

  try {
    const data = await fetchFromApi(`/api/qr/product/${currentModalProduct._id}`);
    if (data && data.qr) {
      imgBox.innerHTML = `<img src="${data.qr}" alt="Product Share QR Code" style="width: 150px; height: 150px; display: block;">`;
    } else {
      throw new Error("Invalid QR response");
    }
  } catch (err) {
    console.error("Failed to fetch product share QR:", err);
    imgBox.innerHTML = `
      <div style="width: 150px; height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 0.7rem; color: var(--danger); text-align: center;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem;"></i>
        <span>Error generating QR</span>
      </div>
    `;
  }
}

function closeProductModal() {
  document.getElementById("productModalBackdrop").classList.remove("active");
}

function updateModalSliderImage() {
  const mainImg = document.getElementById("productModalMainImg");
  if (mainImg) {
    mainImg.src = currentModalImages[currentModalImageIndex];
  }

  // Sync active thumbnail class
  const thumbsContainer = document.getElementById("productModalThumbs");
  if (thumbsContainer) {
    const thumbs = thumbsContainer.querySelectorAll(".card-thumbnail-item");
    thumbs.forEach((th, idx) => {
      if (idx === currentModalImageIndex) {
        th.classList.add("active");
      } else {
        th.classList.remove("active");
      }
    });
  }
}

function selectModalImage(index, element) {
  currentModalImageIndex = index;
  updateModalSliderImage();
}

function navigateProductSlider(direction) {
  if (currentModalImages.length <= 1) return;
  currentModalImageIndex = (currentModalImageIndex + direction + currentModalImages.length) % currentModalImages.length;
  updateModalSliderImage();
}

function selectModalSize(size, btn) {
  const container = document.getElementById("productModalSizes");
  if (container) {
    container.querySelectorAll(".size-select-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  
  // Synchronize size selections back to all duplicate storefront cards
  selectProductCardSize(currentModalProduct._id, size);
}

function generateProductCardMarkup(p) {
  let badgeClass = "badge-kids";
  let displayCategory = "Small Children";
  
  if (p.category === "girls") {
    badgeClass = "badge-girls";
    displayCategory = "Girls";
  } else if (p.category === "men") {
    badgeClass = "badge-men";
    displayCategory = "Men";
  }

  const inStock = p.stock > 0 && p.available;
  let stockClass = "status-in-stock";
  let stockLabel = "In Stock";
  
  if (!inStock) {
    stockClass = "status-out-of-stock";
    stockLabel = "Out of Stock";
  } else if (p.stock < 5) {
    stockClass = "status-low-stock";
    stockLabel = `Only ${p.stock} left!`;
  }

  const dbId = p._id;
  const sizes = (p.sizes && p.sizes.length > 0) ? p.sizes : 
                (p.category === 'children' ? ['2-3Y', '4-5Y', '5-6Y'] : 
                 p.category === 'girls' ? ['S', 'M', 'L', 'XL'] : 
                 ['S', 'M', 'L', 'XL', 'XXL']);

  const isWishlisted = currentCustomer && currentCustomer.wishlist && currentCustomer.wishlist.some(item => {
    const id = item._id || item;
    return id.toString() === dbId.toString();
  });

  return `
    <div class="product-card">
      <div class="product-img-wrapper">
        <span class="product-tag badge ${badgeClass}">${displayCategory}</span>
        ${p.matchPercent ? `<span class="match-badge">${p.matchPercent}% Match</span>` : ''}
        <button class="wishlist-heart-btn ${isWishlisted ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${dbId}')" title="${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}">
          <i class="${isWishlisted ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
        </button>
        <div class="product-images-stack" style="cursor: pointer;" onclick="openProductModal('${dbId}')">
          <img id="img-${dbId}-front" class="card-main-img active" src="${p.image}" alt="${p.name}" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=400'">
          ${p.imageBack ? `<img id="img-${dbId}-back" class="card-main-img" src="${p.imageBack}" alt="${p.name} Back" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=400'">` : ''}
          ${p.imageSide ? `<img id="img-${dbId}-side" class="card-main-img" src="${p.imageSide}" alt="${p.name} Side" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=400'">` : ''}
          ${p.imageZoom ? `<img id="img-${dbId}-zoom" class="card-main-img" src="${p.imageZoom}" alt="${p.name} Zoom" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=400'">` : ''}
        </div>
        ${renderCardImageThumbnails(p, dbId)}
        <div class="product-actions-overlay">
          ${inStock ? `<button class="circle-action-btn" title="Add to Cart" onclick="addToCart('${dbId}')"><i class="fa-solid fa-cart-plus"></i></button>` : ''}
          <button class="circle-action-btn" title="AI Try-on" onclick="tryOnProduct('${dbId}')"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
        </div>
      </div>
      <div class="product-info">
        <div class="product-meta">
          <span>Smart Collection</span>
          <span class="stock-status ${stockClass}">${stockLabel}</span>
        </div>
        <h4 class="product-title" style="cursor: pointer;" onclick="openProductModal('${dbId}')">${p.name}</h4>
        <p class="product-desc">${p.desc}</p>
        
        <!-- Sizing selection buttons -->
        <div class="product-sizes-container">
          <span class="sizes-title">Select Size:</span>
          <div class="sizes-list" id="sizes-${dbId}" data-sizes-for="${dbId}">
            ${sizes.map((sz, idx) => `
              <button class="size-select-btn ${idx === 0 ? 'active' : ''}" onclick="selectProductCardSize('${dbId}', '${sz}', this)">
                ${sz}
              </button>
            `).join("")}
          </div>
        </div>

        <div class="product-price-row" style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%;">
          <div class="price-stack" style="display: flex; flex-direction: column; gap: 2px; text-align: left;">
            ${p.salePrice && p.salePrice < p.price ? `
              <div style="display: flex; align-items: baseline; gap: 4px;">
                <span class="product-price" style="font-size: 1.25rem; font-weight: 700; color: var(--primary);">₹${p.salePrice}</span>
                <span class="original-price-slashed" style="text-decoration: line-through; color: var(--text-muted); font-size: 0.8rem; font-weight: 500;">₹${p.price}</span>
              </div>
              <span class="price-discount-percent" style="color: #2ec4b6; font-size: 0.78rem; font-weight: 700; white-space: nowrap;">(${Math.round(((p.price - p.salePrice) / p.price) * 100)}% OFF)</span>
            ` : `
              <span class="product-price" style="font-size: 1.25rem; font-weight: 700; color: var(--primary);">₹${p.price}</span>
            `}
          </div>
          <div class="card-btn-container" data-btn-for="${dbId}"></div>
        </div>
      </div>
    </div>`;
}

function tryOnProduct(productId) {
  showTab("ai-stylist");
  const p = products.find(prod => prod._id === productId);
  if (!p) return;
  if (p.category === "children") selectAvatar("boy");
  else if (p.category === "girls") selectAvatar("girl");
  else if (p.category === "men") selectAvatar("man");
  
  applyTryOn(productId);
}

// ==========================================================================
// Filtering Systems
// ==========================================================================

function setCategoryFilter(category) {
  currentCategoryFilter = category;
  
  const buttons = ["all", "children", "girls", "men"];
  buttons.forEach(btn => {
    const el = document.getElementById(`btn-cat-${btn}`);
    if (el) {
      if (btn === category) el.classList.add("active");
      else el.classList.remove("active");
    }
  });

  applyFilters();
}

function setEventFilter(eventVal) {
  currentEventFilter = eventVal;
  
  const eventsList = ["all", "birthday", "wedding", "festival", "school", "office"];
  eventsList.forEach(evt => {
    const el = document.getElementById(`btn-event-${evt}`);
    if (el) {
      if (evt === eventVal) el.classList.add("active");
      else el.classList.remove("active");
    }
  });

  applyFilters();
}

function filterShopByEvent(eventVal) {
  showTab("shop");
  setEventFilter(eventVal);
}

function updatePriceSliderLabel() {
  const val = document.getElementById("priceRangeInput").value;
  document.getElementById("priceSliderLabel").textContent = `Max: ₹${val}`;
  applyFilters();
}

function applyFilters() {
  const searchQuery = document.getElementById("shopSearchInput").value.toLowerCase().trim();
  const maxPrice = parseInt(document.getElementById("priceRangeInput").value);
  const onlyInStock = document.getElementById("inStockCheckbox").checked;
  const sortBy = document.getElementById("shopSortSelect").value;

  let filtered = products.filter(p => {
    if (currentCategoryFilter !== "all" && p.category !== currentCategoryFilter) return false;
    if (currentEventFilter !== "all" && p.event !== currentEventFilter) return false;
    if (p.price > maxPrice) return false;
    if (searchQuery && !matchProductSearch(p, searchQuery)) return false;
    if (onlyInStock && (!p.available || p.stock <= 0)) return false;
    return true;
  });

  if (sortBy === "price-low") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortBy === "price-high") {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sortBy === "name-asc") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderShopProducts(filtered);
}

function resetFilters() {
  document.getElementById("shopSearchInput").value = "";
  document.getElementById("priceRangeInput").value = 3000;
  document.getElementById("priceSliderLabel").textContent = "Max: ₹3000";
  document.getElementById("inStockCheckbox").checked = false;
  document.getElementById("shopSortSelect").value = "default";
  setCategoryFilter("all");
  setEventFilter("all");
}

// ==========================================================================
// E-Commerce Cart operations
// ==========================================================================

function toggleCart(isOpen) {
  console.log("toggleCart called with:", isOpen);
  if (isOpen) {
    window.lastCartOpenTime = Date.now();
  } else {
    // Prevent ghost clicks from immediately closing the cart drawer
    if (Date.now() - (window.lastCartOpenTime || 0) < 600) {
      console.log("toggleCart(false) ignored (debounce)");
      return;
    }
  }
  
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartDrawerOverlay");
  if (!drawer || !overlay) {
    alert(`⚠️ DOM Error: drawer: ${!!drawer}, overlay: ${!!overlay}`);
    return;
  }
  if (isOpen) {
    drawer.classList.add("active");
    overlay.classList.add("active");
    console.log("Cart opened (classes added)");
  } else {
    drawer.classList.remove("active");
    overlay.classList.remove("active");
    console.log("Cart closed (classes removed)");
  }
}

function toggleAddressField() {
  const method = document.getElementById("chkDeliveryMethod").value;
  const container = document.getElementById("addressFieldContainer");
  const addrInput = document.getElementById("chkAddress");
  
  if (method === "delivery") {
    container.style.display = "block";
    addrInput.required = true;
  } else {
    container.style.display = "none";
    addrInput.required = false;
  }
  updateCartUI();
}

function addToCart(productId) {
  if (!currentCustomer) {
    alert("Please login to add items to your cart.");
    openProfileOrLoginModal();
    return;
  }
  const p = products.find(prod => prod._id === productId);
  if (!p || p.stock <= 0 || !p.available) return;

  const selectedSize = getSelectedSizeForProduct(productId) || 
                       ((p.sizes && p.sizes.length > 0) ? p.sizes[0] : 
                        (p.category === 'children' ? '2-3Y' : 'S'));

  const activePrice = (p.salePrice && p.salePrice < p.price) ? p.salePrice : p.price;

  const cartItem = cart.find(item => item.id === productId && item.size === selectedSize);
  if (cartItem) {
    if (cartItem.qty < p.stock) {
      cartItem.qty++;
    } else {
      alert(`Cannot add more. Only ${p.stock} units left in stock!`);
      return;
    }
  } else {
    cart.push({
      id: p._id,
      name: p.name,
      price: activePrice,
      image: p.image,
      qty: 1,
      size: selectedSize
    });
  }

  saveCart();
  updateCartUI();
}

function changeCartQty(productId, size, change) {
  const cartItem = cart.find(item => item.id === productId && item.size === size);
  if (!cartItem) return;
  const p = products.find(prod => prod._id === productId);

  if (change > 0) {
    if (cartItem.qty < p.stock) {
      cartItem.qty++;
    } else {
      alert(`Only ${p.stock} units are currently in stock.`);
    }
  } else {
    cartItem.qty--;
    if (cartItem.qty <= 0) {
      cart = cart.filter(item => !(item.id === productId && item.size === size));
    }
  }

  saveCart();
  updateCartUI();
}

function removeFromCart(productId, size) {
  cart = cart.filter(item => !(item.id === productId && item.size === size));
  saveCart();
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById("cartItemsContainer");
  const cartCount = document.getElementById("cartCountBadge");
  const cartDrawerCount = document.getElementById("cartDrawerCount");
  const subtotalText = document.getElementById("cartSubtotal");

  if (!container) return;

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  if (cartCount) cartCount.textContent = totalItems;
  if (cartDrawerCount) cartDrawerCount.textContent = `${totalItems} item${totalItems > 1 || totalItems === 0 ? 's' : ''}`;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-cart-shopping" style="font-size: 2.5rem;"></i>
        <h4>Your cart is empty</h4>
        <p>Start browsing our shop to add garments!</p>
      </div>`;
    if (subtotalText) subtotalText.textContent = "₹0";
    updateAllProductCardAddButtons();
    updateFloatingCartBar();
    return;
  }

  let subtotal = 0;
  container.innerHTML = cart.map(item => {
    const itemTotal = item.price * item.qty;
    subtotal += itemTotal;
    return `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}">
        <div class="cart-item-details">
          <h4>${item.name}</h4>
          <span class="badge badge-secondary" style="font-size:0.7rem; padding:2.5px 7px; background-color:var(--bg-accent); color:var(--text); font-weight:700; border-radius:4px; margin-top:2px; margin-bottom:6px; display:inline-block;">Size: ${item.size}</span>
          <p>₹${item.price} each</p>
          <div class="qty-controller">
            <button class="qty-btn" onclick="changeCartQty('${item.id}', '${item.size}', -1)"><i class="fa-solid fa-minus"></i></button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" onclick="changeCartQty('${item.id}', '${item.size}', 1)"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
        <div class="cart-item-price-del">
          <span class="price">₹${itemTotal}</span>
          <button class="delete-cart-item-btn" onclick="removeFromCart('${item.id}', '${item.size}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`;
  }).join("");

  // Handle customer loyalty points display and discount calculations
  const loyaltyContainer = document.getElementById("loyaltyRedeemContainer");
  const loyaltyBalanceText = document.getElementById("loyaltyBalanceText");
  const loyaltyDiscountRow = document.getElementById("loyaltyDiscountAppliedRow");
  const loyaltyDiscountValue = document.getElementById("loyaltyDiscountValue");
  const chkRedeem = document.getElementById("chkRedeemLoyalty");

  let discount = 0;
  if (loyaltyContainer) {
    if (currentCustomer && subtotal > 0 && currentCustomer.loyaltyPoints >= 200) {
      loyaltyContainer.style.display = "block";
      
      const maxPointsRedeemable = Math.min(currentCustomer.loyaltyPoints, subtotal * 2);
      const potentialDiscount = maxPointsRedeemable * 0.5; // 1 point = ₹0.50 when points >= 200
      
      loyaltyBalanceText.textContent = `${currentCustomer.loyaltyPoints} points available (Worth ₹${(currentCustomer.loyaltyPoints * 0.5).toFixed(2)})`;
      
      if (chkRedeem && chkRedeem.checked) {
        loyaltyDiscountRow.style.display = "flex";
        loyaltyDiscountValue.textContent = `-₹${potentialDiscount.toFixed(2)}`;
        subtotalText.innerHTML = `₹${(subtotal - potentialDiscount).toFixed(2)} <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.95rem; margin-left: 6px; font-weight: 500;">₹${subtotal}</span>`;
        discount = potentialDiscount;
      } else {
        loyaltyDiscountRow.style.display = "none";
        subtotalText.textContent = `₹${subtotal}`;
      }
    } else {
      loyaltyContainer.style.display = "none";
      if (chkRedeem) chkRedeem.checked = false;
      subtotalText.textContent = `₹${subtotal}`;
    }
  } else {
    subtotalText.textContent = `₹${subtotal}`;
  }

  // Calculate delivery fee
  let deliveryFee = 0;
  const deliverySelect = document.getElementById("chkDeliveryMethod");
  const method = deliverySelect ? deliverySelect.value : "pickup";
  
  if (method === "delivery") {
    if (subtotal < 1000) {
      deliveryFee = 50;
    }
  }

  // Update Delivery Fee Row
  const deliveryFeeRow = document.getElementById("cartDeliveryFeeRow");
  const deliveryFeeText = document.getElementById("cartDeliveryFee");
  if (deliveryFeeRow) {
    if (method === "delivery") {
      deliveryFeeRow.style.display = "flex";
      if (deliveryFeeText) {
        deliveryFeeText.textContent = deliveryFee > 0 ? "₹50" : "₹0 (Free)";
      }
    } else {
      deliveryFeeRow.style.display = "none";
    }
  }

  // Calculate Grand Total and Update Grand Total Row
  const grandTotal = subtotal + deliveryFee - discount;
  const grandTotalRow = document.getElementById("cartGrandTotalRow");
  const grandTotalText = document.getElementById("cartGrandTotal");
  if (grandTotalRow) {
    if (method === "delivery" || discount > 0) {
      grandTotalRow.style.display = "flex";
      if (grandTotalText) {
        grandTotalText.textContent = `₹${grandTotal.toFixed(2)}`;
      }
    } else {
      grandTotalRow.style.display = "none";
    }
  }

  // Refresh wishlist recommendations if viewing the wishlist tab
  const activeTabLink = document.querySelector(".nav-link.active");
  if (activeTabLink && activeTabLink.id === "nav-wishlist") {
    renderWishlistTab();
  }

  updateAllProductCardAddButtons();
  updateFloatingCartBar();
}

function updateProductCardAddButtons(productId) {
  const containers = document.querySelectorAll(`[data-btn-for="${productId}"]`);
  if (containers.length === 0) return;

  const p = products.find(prod => prod._id === productId);
  if (!p) return;

  const inStock = p.stock > 0 && p.available;
  const selectedSize = getSelectedSizeForProduct(productId) || 
                       ((p.sizes && p.sizes.length > 0) ? p.sizes[0] : 
                        (p.category === 'children' ? '2-3Y' : 'S'));

  const cartItem = cart.find(item => item.id === productId && item.size === selectedSize);

  let markup = "";
  if (!inStock) {
    markup = `<button class="btn btn-secondary btn-small" style="min-width: 84px; height: 34px; border-radius: 8px; font-size: 0.85rem;" disabled>Out of Stock</button>`;
  } else if (!cartItem) {
    markup = `<button class="add-btn-pill" onclick="addToCart('${productId}')">Add <i class="fa-solid fa-plus" style="font-size: 0.75rem; margin-left: 2px;"></i></button>`;
  } else {
    markup = `
      <div class="inline-qty-controller">
        <button class="inline-qty-btn" onclick="changeCartQty('${productId}', '${selectedSize}', -1)"><i class="fa-solid fa-minus"></i></button>
        <span class="inline-qty-val">${cartItem.qty}</span>
        <button class="inline-qty-btn" onclick="changeCartQty('${productId}', '${selectedSize}', 1)"><i class="fa-solid fa-plus"></i></button>
      </div>
    `;
  }

  containers.forEach(container => {
    container.innerHTML = markup;
  });
}

function updateAllProductCardAddButtons() {
  const containers = document.querySelectorAll('[data-btn-for]');
  containers.forEach(container => {
    const productId = container.getAttribute('data-btn-for');
    updateProductCardAddButtons(productId);
  });
}

function updateFloatingCartBar() {
  const wrapper = document.getElementById("floatingCartWrapper");
  if (!wrapper) return;

  // Hide cart widgets on admin pages
  const adminView = document.getElementById("tab-admin");
  if (adminView && adminView.classList.contains("active")) {
    wrapper.classList.remove("active");
    return;
  }

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  if (totalItems === 0) {
    wrapper.classList.remove("active");
    window.deliveryBannerClosed = false;
    const banner = document.getElementById("floatingDeliveryBanner");
    if (banner) banner.style.display = "flex";
    return;
  }

  // Calculate subtotal for delivery check
  let rawSubtotal = 0;
  cart.forEach(item => {
    rawSubtotal += item.price * item.qty;
  });

  const previouslyEligible = window.deliveryEligible || false;
  const currentlyEligible = rawSubtotal >= 1000;
  if (currentlyEligible && !previouslyEligible) {
    window.deliveryBannerClosed = false; // reopen to celebrate free delivery!
  }
  window.deliveryEligible = currentlyEligible;

  // Show delivery banner if not explicitly closed
  const banner = document.getElementById("floatingDeliveryBanner");
  if (banner) {
    if (window.deliveryBannerClosed) {
      banner.style.display = "none";
    } else {
      banner.style.display = "flex";
      const bannerLeft = banner.querySelector(".delivery-banner-left");
      if (bannerLeft) {
        if (currentlyEligible) {
          bannerLeft.innerHTML = `
            <span class="delivery-check-icon success" style="color: #2b78e4;"><i class="fa-solid fa-circle-check"></i></span>
            <div class="delivery-banner-text">
              <span class="delivery-banner-title">Yay! You got FREE Delivery</span>
              <span class="delivery-banner-subtitle">No coupon needed <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; margin-left: 2px;"></i></span>
            </div>
          `;
        } else {
          const diff = 1000 - rawSubtotal;
          bannerLeft.innerHTML = `
            <span class="delivery-check-icon promo" style="color: #ff9f43;"><i class="fa-solid fa-truck-fast"></i></span>
            <div class="delivery-banner-text">
              <span class="delivery-banner-title">Add ₹${diff} more for FREE Delivery</span>
              <span class="delivery-banner-subtitle">Get free delivery on orders above ₹1000 <i class="fa-solid fa-chevron-right" style="font-size: 0.6rem; margin-left: 2px;"></i></span>
            </div>
          `;
        }
      }
    }
  }

  // Update thumbnails
  const thumbnailsContainer = document.getElementById("floatingCartThumbnails");
  if (thumbnailsContainer) {
    // Unique item images
    const uniqueImages = [...new Set(cart.map(item => item.image))].slice(0, 3);
    thumbnailsContainer.innerHTML = uniqueImages.map(img => `
      <img src="${img}" class="cart-thumb-img" alt="Cart item">
    `).join("");
  }

  // Update summary
  const summaryEl = document.getElementById("floatingCartSummary");
  if (summaryEl) {
    let subtotal = 0;
    cart.forEach(item => {
      subtotal += item.price * item.qty;
    });

    // Check if loyalty discount applied
    const chkRedeem = document.getElementById("chkRedeemLoyalty");
    if (currentCustomer && subtotal > 0 && currentCustomer.loyaltyPoints >= 200 && chkRedeem && chkRedeem.checked) {
      const maxPointsRedeemable = Math.min(currentCustomer.loyaltyPoints, subtotal * 2);
      const potentialDiscount = maxPointsRedeemable * 0.5;
      subtotal = subtotal - potentialDiscount;
    }

    summaryEl.textContent = `${totalItems} Item${totalItems > 1 ? 's' : ''} • ₹${subtotal}`;
  }

  wrapper.classList.add("active");
}

function closeDeliveryBanner(event) {
  if (event) event.stopPropagation();
  const banner = document.getElementById("floatingDeliveryBanner");
  if (banner) {
    banner.style.display = "none";
  }
  window.deliveryBannerClosed = true;
}

// ==========================================================================
// Checkout Handlers (MongoDB posting)
// ==========================================================================

function validateCheckoutForm() {
  const name = document.getElementById("chkName").value.trim();
  const phone = document.getElementById("chkPhone").value.trim();
  const delivery = document.getElementById("chkDeliveryMethod").value;
  const address = document.getElementById("chkAddress").value.trim();
  const pincode = (document.getElementById("chkPincode")?.value || "").trim();

  if (!name || !phone) {
    alert("Please enter both Name and Mobile Number!");
    return null;
  }

  // Enforce exactly 10 digits (ignoring any formatting/spaces/prefixes)
  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    cleanPhone = cleanPhone.slice(2);
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
    cleanPhone = cleanPhone.slice(1);
  }

  if (cleanPhone.length !== 10) {
    alert("Mobile Number must contain exactly 10 digits!");
    return null;
  }

  if (delivery === "delivery") {
    if (!address) {
      alert("Please enter the Delivery Address!");
      return null;
    }
    if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
      alert("Please enter a valid 6-digit Pincode for home delivery!");
      return null;
    }
  }

  return { name, phone: cleanPhone, delivery, address, pincode };
}

function checkoutWhatsApp() {
  const form = validateCheckoutForm();
  if (!form) return;
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }

  let text = `🛒 *NEW ORDER - SMART COLLECTION, JALALPUR* \n\n`;
  text += `👤 *Customer Details:*\n`;
  text += `• Name: ${form.name}\n`;
  text += `• Contact: ${form.phone}\n`;
  text += `• Delivery Type: ${form.delivery === 'pickup' ? 'Self Pickup at Jalalpur Shop' : 'Delhivery Home Delivery'}\n`;
  if (form.delivery === 'delivery') {
    text += `• Address: ${form.address} (PIN: ${form.pincode})\n`;
  }
  text += `\n📦 *Order Items:*\n`;

  let subtotal = 0;
  cart.forEach((item, index) => {
    const itemTotal = item.price * item.qty;
    subtotal += itemTotal;
    text += `${index + 1}. *${item.name}* (Size: ${item.size}, Qty: ${item.qty}) - ₹${item.price} each = *₹${itemTotal}*\n`;
  });

  // Calculate points discount
  let loyaltyDiscount = 0;
  let pointsRedeemed = 0;
  const chkRedeem = document.getElementById("chkRedeemLoyalty");
  if (currentCustomer && chkRedeem && chkRedeem.checked && currentCustomer.loyaltyPoints >= 200) {
    pointsRedeemed = Math.min(currentCustomer.loyaltyPoints, subtotal * 2);
    loyaltyDiscount = pointsRedeemed * 0.5; // 1 point = ₹0.50 when points >= 200
  }

  let deliveryFee = 0;
  if (form.delivery === 'delivery') {
    deliveryFee = subtotal < 1000 ? 50 : 0;
    text += `\n🚚 *Delivery Fee:* ₹${deliveryFee === 0 ? '0 (FREE)' : '50'}\n`;
  }

  if (loyaltyDiscount > 0) {
    text += `\n🪙 *Loyalty Points Discount:* -₹${loyaltyDiscount.toFixed(2)} (Redeemed ${pointsRedeemed} points)\n`;
  }

  text += `\n💵 *Total Amount to Pay:* ₹${(subtotal + deliveryFee - loyaltyDiscount).toFixed(2)}\n`;
  text += `---------------------------------\n`;
  text += `⚡ _Thank you for shopping at Smart Collection, Jalalpur, Saran (841412). Please confirm stock and pick up timing._`;

  const whatsappUrl = `https://wa.me/917827782899?text=${encodeURIComponent(text)}`;
  window.open(whatsappUrl, "_blank");
}

function openPaymentModal() {
  const form = validateCheckoutForm();
  if (!form) return;
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }

  // Clear payment verification fields
  const txnInput = document.getElementById("paymentTxnId");
  if (txnInput) txnInput.value = "";
  clearPaymentScreenshot();

  let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  // Calculate points discount
  let loyaltyDiscount = 0;
  const chkRedeem = document.getElementById("chkRedeemLoyalty");
  if (currentCustomer && chkRedeem && chkRedeem.checked && currentCustomer.loyaltyPoints >= 200) {
    const pointsRedeemed = Math.min(currentCustomer.loyaltyPoints, subtotal * 2);
    loyaltyDiscount = pointsRedeemed * 0.5; // 1 point = ₹0.50 when points >= 200
  }

  let deliveryFee = 0;
  if (form.delivery === 'delivery' && subtotal < 1000) {
    deliveryFee = 50;
  }

  const finalAmount = (subtotal + deliveryFee - loyaltyDiscount).toFixed(2);
  document.getElementById("paymentModalPrice").textContent = `₹${finalAmount}`;
  
  const qrContainer = document.getElementById("upiQrCodeContainer");
  if (qrContainer) {
    qrContainer.innerHTML = `
      <div style="width: 200px; height: 200px; display: flex; align-items: center; justify-content: center;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i>
      </div>
    `;
  }
  
  document.getElementById("paymentModalBackdrop").classList.add("active");
  
  // Fetch UPI QR code dynamically from server matching exact checkout sum
  fetch(`/api/qr/upi?amount=${finalAmount}`)
    .then(res => res.json())
    .then(data => {
      if (data && data.qr) {
        if (qrContainer) {
          qrContainer.innerHTML = `<img src="${data.qr}" alt="UPI Payment QR Code" style="width: 200px; height: 200px; display: block; border-radius: var(--radius-sm); border: 1px solid var(--border);">`;
        }
      } else {
        throw new Error("Invalid QR data");
      }
    })
    .catch(err => {
      console.error("Failed to load payment QR:", err);
      if (qrContainer) {
        qrContainer.innerHTML = `
          <div style="width: 200px; height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--danger); font-size: 0.8rem; padding: 10px; text-align: center;">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem;"></i>
            <span>Failed to generate QR code.</span>
          </div>
        `;
      }
    });
}

function closePaymentModal() {
  document.getElementById("paymentModalBackdrop").classList.remove("active");
}

async function handlePaymentScreenshotUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const filenameSpan = document.getElementById("paymentScreenshotFilename");
  if (filenameSpan) filenameSpan.textContent = file.name;
  
  try {
    const base64 = await convertFileToBase64(file);
    paymentScreenshotBase64 = base64;
    
    const container = document.getElementById("paymentScreenshotPreviewContainer");
    const img = document.getElementById("paymentScreenshotPreview");
    if (container && img) {
      img.src = base64;
      container.style.display = "block";
    }
  } catch (err) {
    console.error("Failed to read screenshot file:", err);
    alert("Error reading screenshot file. Please try another image.");
    clearPaymentScreenshot();
  }
}

function clearPaymentScreenshot() {
  paymentScreenshotBase64 = "";
  const fileInput = document.getElementById("paymentScreenshotInput");
  if (fileInput) fileInput.value = "";
  
  const filenameSpan = document.getElementById("paymentScreenshotFilename");
  if (filenameSpan) filenameSpan.textContent = "No file selected";
  
  const container = document.getElementById("paymentScreenshotPreviewContainer");
  if (container) container.style.display = "none";
  
  const img = document.getElementById("paymentScreenshotPreview");
  if (img) img.src = "";
}

async function simulatePaymentSuccess() {
  const txnId = document.getElementById("paymentTxnId").value.trim();
  if (!txnId && !paymentScreenshotBase64) {
    alert("⚠️ Please provide proof of payment. Enter the 12-digit UPI Transaction ID or upload a confirmation screenshot.");
    return;
  }
  if (txnId && txnId.length !== 12) {
    alert("⚠️ UPI Transaction ID / UTR must be exactly 12 digits.");
    return;
  }

  const form = validateCheckoutForm();
  if (!form) return;

  let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  // Calculate points discount
  let loyaltyDiscount = 0;
  let pointsRedeemed = 0;
  const chkRedeem = document.getElementById("chkRedeemLoyalty");
  if (currentCustomer && chkRedeem && chkRedeem.checked && currentCustomer.loyaltyPoints >= 200) {
    pointsRedeemed = Math.min(currentCustomer.loyaltyPoints, subtotal * 2);
    loyaltyDiscount = pointsRedeemed * 0.5; // 1 point = ₹0.50 when points >= 200
  }

  const orderId = `SC-${Date.now().toString().slice(-6)}`;
  
  const newOrderData = {
    orderId: orderId,
    date: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    items: cart.map(item => ({
      productId: item.id,
      name: `${item.name} (Size: ${item.size})`,
      price: item.price,
      image: item.image,
      qty: item.qty
    })),
    subtotal: subtotal,
    delivery: form.delivery,
    address: form.address,
    pincode: form.pincode || "",
    customerName: form.name,
    customerPhone: form.phone,
    customerEmail: (currentCustomer && currentCustomer.email) ? currentCustomer.email : "",
    redeemPoints: pointsRedeemed > 0,
    pointsRedeemed: pointsRedeemed,
    transactionId: txnId,
    paymentScreenshot: paymentScreenshotBase64
  };

  const deliveryFee = (form.delivery === 'delivery' && subtotal < 1000) ? 50 : 0;

  try {
    // Post to Server (Express will write to MongoDB, update customer points, and decrement stock)
    await fetchFromApi('/api/orders', {
      method: 'POST',
      body: JSON.stringify(newOrderData)
    });

    // Clear Cart
    cart = [];
    saveCart();
    updateCartUI();

    closePaymentModal();
    toggleCart(false);
    
    let alertMsg = `🎉 Order Placed Successfully! Saved to MongoDB.\nOrder ID: ${orderId}.\nFinal Total: ₹${(subtotal + deliveryFee - loyaltyDiscount).toFixed(2)}`;
    if (txnId) alertMsg += `\nUPI Ref/UTR: ${txnId}`;
    if (paymentScreenshotBase64) alertMsg += `\nProof of Payment screenshot uploaded successfully.`;
    
    alert(alertMsg);

    // Reload state
    await loadAllData();
    showTab("history");
  } catch (err) {
    alert(`Checkout failed: ${err.message}`);
  }
}

async function payWithRazorpay() {
  const form = validateCheckoutForm();
  if (!form) return;
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }

  let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  // Calculate points discount
  let loyaltyDiscount = 0;
  let pointsRedeemed = 0;
  const chkRedeem = document.getElementById("chkRedeemLoyalty");
  if (currentCustomer && chkRedeem && chkRedeem.checked && currentCustomer.loyaltyPoints >= 200) {
    pointsRedeemed = Math.min(currentCustomer.loyaltyPoints, subtotal * 2);
    loyaltyDiscount = pointsRedeemed * 0.5; // 1 point = ₹0.50 when points >= 200
  }

  const orderId = `SC-${Date.now().toString().slice(-6)}`;
  
  const orderDetails = {
    orderId: orderId,
    date: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    items: cart.map(item => ({
      productId: item.id,
      name: `${item.name} (Size: ${item.size})`,
      price: item.price,
      image: item.image,
      qty: item.qty
    })),
    subtotal: subtotal,
    delivery: form.delivery,
    address: form.address,
    pincode: form.pincode || "",
    customerName: form.name,
    customerPhone: form.phone,
    customerEmail: (currentCustomer && currentCustomer.email) ? currentCustomer.email : "",
    redeemPoints: pointsRedeemed > 0,
    pointsRedeemed: pointsRedeemed
  };

  try {
    // Show loading indicator
    const btn = document.querySelector("button[onclick='payWithRazorpay()']");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Initializing Payment...`;
    btn.disabled = true;

    // 1. Create order on backend
    const razorpayOrder = await fetchFromApi('/api/razorpay/create-order', {
      method: 'POST',
      body: JSON.stringify({
        items: orderDetails.items,
        delivery: orderDetails.delivery,
        pointsRedeemed: orderDetails.pointsRedeemed,
        customerPhone: orderDetails.customerPhone,
        customerEmail: orderDetails.customerEmail
      })
    });

    btn.innerHTML = originalText;
    btn.disabled = false;

    if (!razorpayOrder || !razorpayOrder.id) {
      throw new Error("Failed to initialize payment order on server.");
    }

    // 2. Configure and Open Razorpay Checkout Pop-up
    const options = {
      key: razorpayOrder.key_id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      name: "Smart Collection Boutique",
      description: `Purchase for ${orderDetails.customerName}`,
      image: "images/logo.jpg",
      order_id: razorpayOrder.id,
      handler: async function (response) {
        try {
          // Show verifying status
          btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying Payment...`;
          btn.disabled = true;

          // 3. Verify payment signature and save order on backend
          const verificationResult = await fetchFromApi('/api/razorpay/verify-payment', {
            method: 'POST',
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              orderDetails: orderDetails
            })
          });

          if (verificationResult && verificationResult.success) {
            // Clear Cart
            cart = [];
            saveCart();
            updateCartUI();
            toggleCart(false);

            alert(`🎉 Payment Successful & Order Placed!\nOrder ID: ${orderId}\nPayment ID: ${response.razorpay_payment_id}`);

            // Reload state
            await loadAllData();
            showTab("history");
          } else {
            throw new Error(verificationResult.error || "Verification failed");
          }
        } catch (verifyErr) {
          alert(`⚠️ Payment verification failed: ${verifyErr.message}\nIf money was deducted, please contact support with order ref: ${orderId}`);
        } finally {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      },
      prefill: {
        name: orderDetails.customerName,
        email: orderDetails.customerEmail,
        contact: orderDetails.customerPhone
      },
      notes: {
        shop_address: "Jalalpur, Saran, Bihar"
      },
      theme: {
        color: "#8B1538" // Burgundy brand color matching the boutique theme
      },
      modal: {
        ondismiss: function() {
          console.log("Razorpay Checkout dismissed by user");
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();

  } catch (err) {
    alert(`Payment initialization failed: ${err.message}`);
  }
}

// ==========================================================================
// Delhivery Direct Shipping Helper Functions
// ==========================================================================

async function handlePincodeInput(pincode) {
  const statusText = document.getElementById("delhiveryStatusText");
  if (!statusText) return;

  if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
    statusText.textContent = "Enter PIN";
    statusText.style.color = "var(--text-muted)";
    statusText.style.background = "rgba(0,0,0,0.05)";
    return;
  }

  statusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
  statusText.style.color = "var(--text-muted)";
  statusText.style.background = "rgba(0,0,0,0.05)";

  try {
    const res = await fetch(`/api/delhivery/check-pincode?pincode=${pincode}`);
    const data = await res.json();
    if (data && data.serviceable) {
      statusText.innerHTML = '<i class="fa-solid fa-circle-check"></i> Delhivery Serviceable (' + (data.estDeliveryDays || 5) + ' days)';
      statusText.style.color = "#10b981";
      statusText.style.background = "rgba(16, 185, 129, 0.1)";
    } else {
      statusText.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Delhivery Unserviceable (Post Fallback)';
      statusText.style.color = "#f59f00";
      statusText.style.background = "rgba(245, 159, 0, 0.1)";
    }
  } catch (err) {
    console.error("Failed to verify pincode:", err);
    statusText.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Offline Fallback';
    statusText.style.color = "#f59f00";
    statusText.style.background = "rgba(245, 159, 0, 0.1)";
  }
}

async function shipViaDelhivery(orderId) {
  try {
    const confirmShip = confirm("Are you sure you want to register this shipment with Delhivery?");
    if (!confirmShip) return;

    const res = await fetchFromApi(`/api/orders/${orderId}/delhivery-ship`, {
      method: "POST"
    });

    if (res && res.success) {
      alert(`🎉 Shipment manifested successfully!\nWaybill: ${res.waybill}`);
      await loadAllData();
      renderAdminOrders();
    } else {
      throw new Error(res.error || "Failed to ship order via Delhivery.");
    }
  } catch (err) {
    alert(`Delhivery shipping failed: ${err.message}`);
  }
}

async function trackDelhiveryShipment(dbId, orderId) {
  const modal = document.getElementById("delhiveryTrackingModalBackdrop");
  const trackWaybill = document.getElementById("trackWaybill");
  const statusBadge = document.getElementById("trackCurrentStatusBadge");
  const timeline = document.getElementById("trackTimeline");

  if (!modal || !trackWaybill || !statusBadge || !timeline) return;

  trackWaybill.textContent = "Loading...";
  statusBadge.textContent = "Loading...";
  statusBadge.className = "status-badge";
  statusBadge.style.background = "var(--border)";
  statusBadge.style.color = "var(--text-muted)";
  
  timeline.innerHTML = `
    <div style="text-align: center; padding: 20px; color: var(--text-muted);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 8px;"></i><br>
      Connecting to Delhivery tracking services...
    </div>
  `;

  modal.classList.add("active");

  try {
    const res = await fetch(`/api/orders/${dbId}/delhivery-track`);
    const data = await res.json();

    if (data && data.success) {
      trackWaybill.textContent = data.waybill;
      statusBadge.textContent = data.status;
      
      if (data.status === "Delivered") {
        statusBadge.style.background = "rgba(16, 185, 129, 0.15)";
        statusBadge.style.color = "#10b981";
      } else if (data.status === "Manifested") {
        statusBadge.style.background = "rgba(59, 130, 246, 0.15)";
        statusBadge.style.color = "#3b82f6";
      } else {
        statusBadge.style.background = "rgba(245, 159, 0, 0.15)";
        statusBadge.style.color = "#f59f00";
      }

      if (data.history && data.history.length > 0) {
        let html = '<div class="track-timeline-line"></div>';
        
        data.history.forEach((milestone, idx) => {
          const isCurrent = idx === data.history.length - 1;
          const timeFormatted = milestone.time ? new Date(milestone.time).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          }) : '';

          html += `
            <div class="track-milestone active \${isCurrent ? 'current' : ''}">
              <div class="track-milestone-dot"></div>
              <div class="track-milestone-title">\${milestone.status}</div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <span class="track-milestone-location">\${milestone.location || 'Hub'}</span>
                <span class="track-milestone-time">\${timeFormatted}</span>
              </div>
              <div class="track-milestone-details">\${milestone.details || ''}</div>
            </div>
          `;
        });
        
        timeline.innerHTML = html;
      } else {
        timeline.innerHTML = `
          <div style="text-align: center; padding: 20px; color: var(--text-muted);">
            No scans recorded yet. Package is awaiting pickup.
          </div>
        `;
      }
    } else {
      throw new Error(data.error || "No response");
    }
  } catch (err) {
    console.error("Tracking error:", err);
    timeline.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--danger);">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem; margin-bottom: 8px;"></i><br>
        Failed to fetch real-time tracking details from Delhivery. Please try again later.
      </div>
    `;
  }
}

function closeDelhiveryTrackingModal() {
  document.getElementById("delhiveryTrackingModalBackdrop").classList.remove("active");
}

// ==========================================================================
// Order History, Reviews & Exchanges (MongoDB)
// ==========================================================================

function renderHistory() {
  const container = document.getElementById("historyList");
  const emptyMsg = document.getElementById("historyEmptyMessage");
  if (!container) return;

  const emptyTitle = emptyMsg.querySelector("h3");
  const emptyText = emptyMsg.querySelector("p");
  const emptyBtn = emptyMsg.querySelector("button");

  if (!currentCustomer) {
    if (emptyTitle) emptyTitle.textContent = "Please Login to View History";
    if (emptyText) emptyText.textContent = "Login with your phone number or Google account to view your past purchases and track active deliveries.";
    if (emptyBtn) {
      emptyBtn.textContent = "Login / Sign Up";
      emptyBtn.onclick = () => openProfileOrLoginModal();
    }
    container.style.display = "none";
    emptyMsg.style.display = "block";
    return;
  }

  const myOrders = orders.filter(order => 
    (currentCustomer.phone && order.customerPhone === currentCustomer.phone) || 
    (currentCustomer.email && order.customerEmail === currentCustomer.email)
  );

  if (myOrders.length === 0) {
    if (emptyTitle) emptyTitle.textContent = "No orders found";
    if (emptyText) emptyText.textContent = "Make your first purchase and complete payment to view your shopping history here.";
    if (emptyBtn) {
      emptyBtn.textContent = "Go Shopping";
      emptyBtn.onclick = () => showTab('shop');
    }
    container.style.display = "none";
    emptyMsg.style.display = "block";
    return;
  }

  container.style.display = "flex";
  emptyMsg.style.display = "none";

  container.innerHTML = myOrders.map(order => {
    // Generate tracking timeline details
    let progressPercent = 0;
    const s = order.status;
    let showTimeline = true;
    let stepIndex = 0;
    
    if (s === "Cancelled") {
      showTimeline = false;
    } else if (s === "Confirmed") {
      stepIndex = 1;
      progressPercent = 20;
    } else if (s === "Packed") {
      stepIndex = 2;
      progressPercent = 40;
    } else if (s === "Shipped") {
      stepIndex = 3;
      progressPercent = 60;
    } else if (s === "Out for Delivery") {
      stepIndex = 4;
      progressPercent = 80;
    } else if (s === "Delivered" || s.startsWith("Exchange")) {
      stepIndex = 5;
      progressPercent = 100;
    } else {
      // Order Received or legacy Pending / Paid & Ordered
      stepIndex = 0;
      progressPercent = 0;
    }

    const trackingTimelineHtml = showTimeline ? `
      <div class="order-tracking-timeline">
        <div class="timeline-line">
          <div class="timeline-line-progress" style="width: ${progressPercent}%;"></div>
        </div>
        <div class="timeline-step ${stepIndex >= 0 ? 'active' : ''}">
          <div class="step-icon"><i class="fa-solid fa-receipt"></i></div>
          <div class="step-label">Order Received</div>
        </div>
        <div class="timeline-step ${stepIndex >= 1 ? 'active' : ''}">
          <div class="step-icon"><i class="fa-solid fa-square-check"></i></div>
          <div class="step-label">Confirmed</div>
        </div>
        <div class="timeline-step ${stepIndex >= 2 ? 'active' : ''}">
          <div class="step-icon"><i class="fa-solid fa-box-open"></i></div>
          <div class="step-label">Packed</div>
        </div>
        <div class="timeline-step ${stepIndex >= 3 ? 'active' : ''}">
          <div class="step-icon"><i class="fa-solid fa-truck-fast"></i></div>
          <div class="step-label">Shipped</div>
        </div>
        <div class="timeline-step ${stepIndex >= 4 ? 'active' : ''}">
          <div class="step-icon"><i class="fa-solid fa-truck-ramp-box"></i></div>
          <div class="step-label">Out for Delivery</div>
        </div>
        <div class="timeline-step ${stepIndex >= 5 ? 'active' : ''}">
          <div class="step-icon"><i class="fa-solid fa-house-chimney-check"></i></div>
          <div class="step-label">Delivered</div>
        </div>
      </div>
    ` : `
      <div class="cancelled-details" style="margin-bottom: 15px; padding: 12px; border-radius: 8px; background: rgba(231, 29, 54, 0.1); border: 1px solid #e71d36; color: #e71d36; font-size: 0.9rem;">
        <strong>❌ Order Cancelled</strong><br>
        <span style="font-weight: 500; font-size: 0.85rem; margin-top: 4px; display: inline-block;">Reason for Cancellation: "${order.cancelReason || 'No reason provided'}"</span>
      </div>
    `;

    let trackButtonHtml = '';
    if (order.trackingCourier === 'Delhivery' && order.delhiveryWaybill) {
      trackButtonHtml = `
        <button class="btn btn-secondary btn-small" style="margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; background: rgba(90,82,237,0.1); color: var(--primary); border: 1px solid rgba(90,82,237,0.3);" onclick="trackDelhiveryShipment('${order._id}', '${order.orderId}')">
          <i class="fa-solid fa-truck-fast"></i> Live Delhivery Track
        </button>
      `;
    }

    const courierHtml = (order.trackingCourier || order.trackingNumber) ? `
      <div class="tracking-details" style="margin-bottom: 15px;">
        <strong>🚚 Courier Partner:</strong> ${order.trackingCourier} <br>
        <strong>📦 Tracking ID:</strong> <code>${order.trackingNumber}</code>
        ${trackButtonHtml}
      </div>
    ` : '';

    return `
      <div class="history-card">
        <div class="history-card-header">
          <div>
            <span class="order-id">Order ID: ${order.orderId}</span>
            <div class="order-date">${order.date}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn btn-secondary btn-small" style="padding: 4px 8px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;" onclick="downloadInvoice('${order.orderId}')"><i class="fa-solid fa-file-pdf"></i> Invoice</button>
            <span class="order-status-badge ${s === 'Cancelled' ? 'status-cancelled' : ''}">${order.status}</span>
          </div>
        </div>
        <div class="order-items-list">
          ${order.items.map(item => {
            const itemDbId = item.productId || item.id || item.name;
            const hasReviewed = reviews.some(r => r.orderId === order.orderId && (r.productId === itemDbId || r.productId === item.productId || r.productId === item.id));
            
            const exRecord = exchanges.find(ex => ex.orderId === order.orderId && (ex.productId === itemDbId || ex.productId === item.productId || ex.productId === item.id));
            const hasExchanged = !!exRecord;
            const exchangeStatusLabel = exRecord ? (exRecord.status === "Approved" ? "Exchange Approved" : exRecord.status === "Rejected" ? "Exchange Rejected" : "Exchange Pending") : "";
            
            // Exchange button visibility condition: order status must be "Delivered" and delivery date within 7 days
            const isDelivered = order.status === "Delivered";
            let canExchange = false;
            if (isDelivered) {
              if (order.deliveryDate) {
                const deliveryDate = new Date(order.deliveryDate);
                const now = new Date();
                const diffTime = now - deliveryDate;
                const diffDays = diffTime / (1000 * 60 * 60 * 24);
                // Within 7 days
                canExchange = diffDays >= 0 && diffDays <= 7;
              } else {
                // Fallback for legacy delivered orders that do not have a deliveryDate field
                canExchange = true;
              }
            }
            
            const feedbackText = (exRecord && exRecord.status === "Rejected" && exRecord.adminFeedback) ? 
              `<div style="margin-top: 6px; color: #e71d36; font-size: 0.8rem; font-weight: 500;"><i class="fa-solid fa-circle-info"></i> Rejection Reason: "${exRecord.adminFeedback}"</div>` : '';

            // Disable reviews/exchanges if the order is cancelled
            const hideReviewExchangeButtons = s === "Cancelled";

            const catalogProduct = products.find(p => p._id === itemDbId || p.name === itemDbId.split(" (Size:")[0] || p.name === item.name.split(" (Size:")[0]);
            const imageSrc = item.image || (catalogProduct ? catalogProduct.image : 'https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=100');

            return `
              <div class="order-item-row">
                <img src="${imageSrc}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=100'">
                <div class="order-item-details">
                  <h5>${item.name}</h5>
                  <p>Category: ${catalogProduct?.category || 'General'}</p>
                </div>
                <div class="order-item-qty">Qty: ${item.qty}</div>
                <div class="order-item-price">₹${item.price * item.qty}</div>
              </div>
              ${hideReviewExchangeButtons ? '' : `
              <div class="order-item-actions" style="display:flex; flex-direction:column; align-items:flex-start; gap:4px;">
                <div style="display:flex; gap:6px;">
                  ${hasReviewed ? `<button class="btn btn-secondary btn-small" disabled><i class="fa-solid fa-circle-check"></i> Reviewed</button>` : 
                                 `<button class="btn btn-primary btn-small" onclick="openReviewModal('${order.orderId}', '${itemDbId}')"><i class="fa-solid fa-star"></i> Write Review</button>`}
                  
                  ${hasExchanged ? `<button class="btn btn-secondary btn-small" disabled><i class="fa-solid fa-arrows-spin"></i> ${exchangeStatusLabel}</button>` : 
                                  (canExchange ? `<button class="btn btn-secondary btn-small" onclick="openExchangeModal('${order.orderId}', '${itemDbId}')"><i class="fa-solid fa-right-left"></i> Exchange Item</button>` : '')}
                </div>
                ${feedbackText}
              </div>`}
            `;
          }).join("<div class='border-divider' style='border-top:1px solid var(--border); margin:10px 0;'></div>")}
        </div>
        ${trackingTimelineHtml}
        ${courierHtml}
        <div class="history-card-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div class="delivery-info">
            <strong>Method:</strong> ${order.delivery === 'pickup' ? 'Pickup at Shop' : (order.trackingCourier === 'Delhivery' ? 'Delhivery Shipping' : 'Local Delivery')}
            ${order.delivery === 'delivery' ? `<br><small>${order.address} (PIN: ${order.pincode || ''})</small>` : ''}
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <div class="order-total">Total: ₹${order.subtotal}</div>
            ${(order.status === "Order Received" || order.status === "Confirmed" || order.status === "Pending" || order.status === "Paid & Ordered") ? 
              `<button class="btn btn-danger btn-small" onclick="openCancelOrderModal('${order._id}', '${order.orderId}')"><i class="fa-solid fa-rectangle-xmark"></i> Cancel Order</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join("");
}

function openCancelOrderModal(dbId, orderId) {
  document.getElementById("cancelOrderId").value = dbId;
  document.getElementById("cancelOrderCode").value = orderId;
  document.getElementById("cancelOrderCodeText").textContent = orderId;
  document.getElementById("cancelReasonSelect").value = "Changed my mind";
  document.getElementById("cancelReasonOther").value = "";
  document.getElementById("cancelReasonOtherContainer").style.display = "none";
  document.getElementById("cancelOrderModalBackdrop").classList.add("active");
}

function closeCancelOrderModal() {
  document.getElementById("cancelOrderModalBackdrop").classList.remove("active");
}

function toggleCancelReasonOther() {
  const select = document.getElementById("cancelReasonSelect");
  const otherContainer = document.getElementById("cancelReasonOtherContainer");
  if (select.value === "Other") {
    otherContainer.style.display = "block";
  } else {
    otherContainer.style.display = "none";
  }
}

async function submitCancelOrder() {
  const dbId = document.getElementById("cancelOrderId").value;
  const orderId = document.getElementById("cancelOrderCode").value;
  const select = document.getElementById("cancelReasonSelect");
  let reason = select.value;
  
  if (reason === "Other") {
    const otherVal = document.getElementById("cancelReasonOther").value.trim();
    if (!otherVal) {
      alert("Please specify the cancellation reason.");
      return;
    }
    reason = otherVal;
  }

  try {
    await fetchFromApi(`/api/orders/${dbId}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason: reason })
    });

    closeCancelOrderModal();
    alert(`❌ Order ${orderId} has been successfully cancelled.`);
    
    // Reload state
    await loadAllData();
    showTab("history");
  } catch (err) {
    alert(`Cancellation failed: ${err.message}`);
  }
}

function openReviewModal(orderId, productId) {
  document.getElementById("reviewOrderId").value = orderId;
  document.getElementById("reviewItemId").value = productId;
  document.getElementById("reviewComment").value = "";
  setStarRating(5);
  document.getElementById("reviewModalBackdrop").classList.add("active");
}

function closeReviewModal() {
  document.getElementById("reviewModalBackdrop").classList.remove("active");
}

function setStarRating(rating) {
  currentRatingSelection = rating;
  const stars = document.querySelectorAll(".star-rating-input .star-btn");
  stars.forEach((star, index) => {
    if (index < rating) star.classList.add("active");
    else star.classList.remove("active");
  });
  document.getElementById("starRatingValueText").textContent = `${rating} Star${rating > 1 ? 's' : ''}`;
}

async function submitReview() {
  const orderId = document.getElementById("reviewOrderId").value;
  const productId = document.getElementById("reviewItemId").value;
  const comment = document.getElementById("reviewComment").value.trim();

  if (!comment) {
    alert("Please write a feedback description!");
    return;
  }

  const p = products.find(prod => prod._id === productId || prod.name === productId.split(" (Size:")[0]);
  const reviewObj = {
    reviewId: `REV-${Date.now().toString().slice(-5)}`,
    orderId: orderId,
    productId: productId,
    productName: p ? p.name : "Ready-Made Clothing Item",
    rating: currentRatingSelection,
    comment: comment,
    date: new Date().toLocaleDateString('en-IN')
  };

  try {
    await fetchFromApi('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(reviewObj)
    });
    closeReviewModal();
    alert("Review submitted to MongoDB successfully!");
    await loadAllData();
  } catch (err) {
    alert(`Failed to save review: ${err.message}`);
  }
}

function openExchangeModal(orderId, productId) {
  const order = orders.find(o => o.orderId === orderId);
  let item = order ? order.items.find(i => {
    const idVal = i.productId || i.id;
    return idVal && idVal.toString() === productId;
  }) : null;
  
  if (!item && order) {
    item = order.items.find(i => i.name === productId);
  }
  
  if (!item) return;

  document.getElementById("exchangeOrderId").value = orderId;
  document.getElementById("exchangeItemId").value = item.productId || item.id || item.name;
  document.getElementById("exchangeDetails").value = "";
  document.getElementById("exchangeReason").value = "sizing-too-small";

  document.getElementById("exchangeProductPreview").innerHTML = `
    <img src="${item.image}" alt="${item.name}">
    <div>
      <h4>${item.name}</h4>
      <p>Original Quantity: ${item.qty} | Price Paid: ₹${item.price * item.qty}</p>
    </div>`;

  updateExchangeSuggestions();
  document.getElementById("exchangeModalBackdrop").classList.add("active");
}

function updateExchangeSuggestions() {
  const container = document.getElementById("exchangeSuggestionsContainer");
  const list = document.getElementById("exchangeSuggestionsList");
  if (!container || !list) return;
  
  const orderId = document.getElementById("exchangeOrderId").value;
  const itemId = document.getElementById("exchangeItemId").value;
  const reason = document.getElementById("exchangeReason").value;
  
  const order = orders.find(o => o.orderId === orderId);
  if (!order) {
    container.style.display = "none";
    return;
  }
  
  let item = order.items.find(i => {
    const idVal = i.productId || i.id;
    return (idVal && idVal.toString() === itemId) || i.name === itemId;
  });
  
  if (!item) {
    container.style.display = "none";
    return;
  }
  
  const nameStr = item.name;
  const sizeMatch = nameStr.match(/\(Size:\s*([^)]+)\)/i);
  const originalSize = sizeMatch ? sizeMatch[1].trim() : "";
  
  let originalProdName = nameStr.replace(/\(Size:\s*[^)]+\)/i, "").trim();
  originalProdName = originalProdName.replace(/\[[^\]]+\]/g, "").trim();
  
  const product = products.find(p => p._id === item.productId || p.name === originalProdName);
  if (!product) {
    container.style.display = "none";
    return;
  }
  
  const allSizes = product.sizes || [];
  const sizeIndex = allSizes.indexOf(originalSize);
  
  let suggestionsHtml = "";
  
  if (reason === "sizing-too-small") {
    let largerSizesInStock = [];
    if (sizeIndex !== -1) {
      largerSizesInStock = allSizes.slice(sizeIndex + 1);
    }
    
    if (product.stock > 0 && product.available) {
      largerSizesInStock.forEach(sz => {
        suggestionsHtml += `
          <button type="button" class="btn btn-secondary btn-small" onclick="selectExchangeSuggestion('${escapeHtml(escapeJsString(product.name))}', '${escapeHtml(escapeJsString(sz))}')" style="text-align: left; justify-content: flex-start; padding: 10px; font-size: 0.85rem; width: 100%; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-angle-up" style="color: var(--primary);"></i> Exchange for <strong>${escapeHtml(product.name)}</strong> in size <strong>${escapeHtml(sz)}</strong> (In Stock)
          </button>
        `;
      });
    }
    
    const alternatives = products.filter(p => p.category === product.category && p._id.toString() !== product._id.toString() && p.stock > 0 && p.available);
    alternatives.slice(0, 3).forEach(alt => {
      const altSize = alt.sizes[0] || "M";
      suggestionsHtml += `
        <button type="button" class="btn btn-secondary btn-small" onclick="selectExchangeSuggestion('${escapeHtml(escapeJsString(alt.name))}', '${escapeHtml(escapeJsString(altSize))}')" style="text-align: left; justify-content: flex-start; padding: 10px; font-size: 0.85rem; width: 100%; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-rotate" style="color: var(--warning);"></i> Replace with <strong>${escapeHtml(alt.name)}</strong> (Size: ${escapeHtml(altSize)}) - ₹${alt.salePrice || alt.price}
        </button>
      `;
    });
    
  } else if (reason === "sizing-too-large") {
    let smallerSizesInStock = [];
    if (sizeIndex !== -1) {
      smallerSizesInStock = allSizes.slice(0, sizeIndex).reverse();
    }
    
    if (product.stock > 0 && product.available) {
      smallerSizesInStock.forEach(sz => {
        suggestionsHtml += `
          <button type="button" class="btn btn-secondary btn-small" onclick="selectExchangeSuggestion('${escapeHtml(escapeJsString(product.name))}', '${escapeHtml(escapeJsString(sz))}')" style="text-align: left; justify-content: flex-start; padding: 10px; font-size: 0.85rem; width: 100%; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-angle-down" style="color: var(--primary);"></i> Exchange for <strong>${escapeHtml(product.name)}</strong> in size <strong>${escapeHtml(sz)}</strong> (In Stock)
          </button>
        `;
      });
    }
    
    const alternatives = products.filter(p => p.category === product.category && p._id.toString() !== product._id.toString() && p.stock > 0 && p.available);
    alternatives.slice(0, 3).forEach(alt => {
      const altSize = alt.sizes[0] || "M";
      suggestionsHtml += `
        <button type="button" class="btn btn-secondary btn-small" onclick="selectExchangeSuggestion('${escapeHtml(escapeJsString(alt.name))}', '${escapeHtml(escapeJsString(altSize))}')" style="text-align: left; justify-content: flex-start; padding: 10px; font-size: 0.85rem; width: 100%; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-rotate" style="color: var(--warning);"></i> Replace with <strong>${escapeHtml(alt.name)}</strong> (Size: ${escapeHtml(altSize)}) - ₹${alt.salePrice || alt.price}
        </button>
      `;
    });
    
  } else if (reason === "color-preference") {
    const alternatives = products.filter(p => p.category === product.category && p._id.toString() !== product._id.toString() && p.stock > 0 && p.available);
    
    if (alternatives.length === 0) {
      suggestionsHtml = `<div style="font-size: 0.82rem; color: var(--text-muted);">No alternative colors/products in stock at the moment.</div>`;
    } else {
      alternatives.slice(0, 4).forEach(alt => {
        const altSize = alt.sizes.includes(originalSize) ? originalSize : (alt.sizes[0] || "M");
        suggestionsHtml += `
          <button type="button" class="btn btn-secondary btn-small" onclick="selectExchangeSuggestion('${escapeHtml(escapeJsString(alt.name))}', '${escapeHtml(escapeJsString(altSize))}')" style="text-align: left; justify-content: flex-start; padding: 10px; font-size: 0.85rem; width: 100%; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-palette" style="color: var(--success);"></i> Replace with <strong>${escapeHtml(alt.name)}</strong> (Size: ${escapeHtml(altSize)}) - ₹${alt.salePrice || alt.price}
          </button>
        `;
      });
    }
  } else {
    const alternatives = products.filter(p => p.category === product.category && p._id.toString() !== product._id.toString() && p.stock > 0 && p.available);
    alternatives.slice(0, 3).forEach(alt => {
      const altSize = alt.sizes.includes(originalSize) ? originalSize : (alt.sizes[0] || "M");
      suggestionsHtml += `
        <button type="button" class="btn btn-secondary btn-small" onclick="selectExchangeSuggestion('${escapeHtml(escapeJsString(alt.name))}', '${escapeHtml(escapeJsString(altSize))}')" style="text-align: left; justify-content: flex-start; padding: 10px; font-size: 0.85rem; width: 100%; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-square-check" style="color: var(--text-muted);"></i> Replace with <strong>${escapeHtml(alt.name)}</strong> (Size: ${escapeHtml(altSize)})
        </button>
      `;
    });
  }
  
  if (suggestionsHtml) {
    list.innerHTML = suggestionsHtml;
    container.style.display = "block";
  } else {
    container.style.display = "none";
  }
}

function selectExchangeSuggestion(name, size) {
  const details = document.getElementById("exchangeDetails");
  if (details) {
    details.value = `Exchange for: "${name}" (Size: ${size}).`;
    details.style.borderColor = "var(--primary)";
    setTimeout(() => {
      details.style.borderColor = "var(--border)";
    }, 1000);
  }
}

function closeExchangeModal() {
  document.getElementById("exchangeModalBackdrop").classList.remove("active");
}

async function submitExchangeRequest() {
  const orderId = document.getElementById("exchangeOrderId").value;
  const productId = document.getElementById("exchangeItemId").value;
  const reason = document.getElementById("exchangeReason").value;
  const details = document.getElementById("exchangeDetails").value.trim();

  if (!details) {
    alert("Please provide exchange requirements!");
    return;
  }

  const p = products.find(prod => prod._id === productId || prod.name === productId.split(" (Size:")[0]);
  const exchangeObj = {
    exchangeId: `EXC-${Date.now().toString().slice(-5)}`,
    orderId: orderId,
    productId: productId,
    productName: p ? p.name : "Garment",
    reason: reason,
    details: details,
    status: "Pending Admin Approval",
    date: new Date().toLocaleDateString('en-IN')
  };

  try {
    await fetchFromApi('/api/exchanges', {
      method: 'POST',
      body: JSON.stringify(exchangeObj)
    });
    closeExchangeModal();
    alert("Exchange request submitted to database!");
    await loadAllData();
  } catch (err) {
    alert(`Failed to submit exchange: ${err.message}`);
  }
}

// ==========================================================================
// Admin Panel Management (MongoDB API integrations)
// ==========================================================================

function updateAdminStats() {
  document.getElementById("adminStatTotalProducts").textContent = products.length;
  document.getElementById("adminStatTotalOrders").textContent = orders.filter(o => o.status !== "Cancelled").length;
  document.getElementById("adminStatExchanges").textContent = exchanges.filter(ex => ex.status === "Pending Admin Approval").length;

  const uniquePhones = new Set();
  orders.forEach(order => {
    if (order.status !== "Cancelled" && order.customerPhone) {
      const cleanPhone = order.customerPhone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        uniquePhones.add(cleanPhone);
      }
    }
  });

  const totalCustomersEl = document.getElementById("adminStatTotalCustomers");
  if (totalCustomersEl) {
    totalCustomersEl.textContent = uniquePhones.size;
  }
}

function renderAdminInventory() {
  const tbody = document.getElementById("adminInventoryTableBody");
  if (!tbody) return;

  tbody.innerHTML = products.map(p => {
    return `
      <tr>
        <td class="prod-item" style="display:flex; align-items:center; gap:12px;">
          <div class="admin-thumb-grid">
            <div class="admin-thumb-cell" title="Change Front View" onclick="triggerEditImage('${p._id}', 'front')">
              <img src="${p.image}" alt="Front">
              <span class="admin-thumb-label">F</span>
            </div>
            <div class="admin-thumb-cell" title="Change Back View" onclick="triggerEditImage('${p._id}', 'back')">
              <img src="${p.imageBack || p.image}" alt="Back">
              <span class="admin-thumb-label">B</span>
            </div>
            <div class="admin-thumb-cell" title="Change Side View" onclick="triggerEditImage('${p._id}', 'side')">
              <img src="${p.imageSide || p.image}" alt="Side">
              <span class="admin-thumb-label">S</span>
            </div>
            <div class="admin-thumb-cell" title="Change Zoomed View" onclick="triggerEditImage('${p._id}', 'zoom')">
              <img src="${p.imageZoom || p.image}" alt="Zoom">
              <span class="admin-thumb-label">Z</span>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; width:100%;">
            <input type="text" value="${p.name}" style="font-weight:600; padding:6px; font-size:0.85rem; width:100%;" onchange="updateProductName('${p._id}', this.value)">
            <div style="position: relative; display: flex; align-items: center; gap: 4px; width: 100%;">
              <textarea style="font-size:0.75rem; padding:6px; width:100%; resize:vertical; font-family:inherit; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-body);" rows="1" placeholder="Description" onchange="updateProductDesc('${p._id}', this.value)">${p.desc || ''}</textarea>
              <button type="button" class="btn btn-secondary btn-small" onclick="generateAIDescriptionForProduct('${p._id}')" title="AI Generate Description" style="padding: 4px 6px; font-size: 0.7rem; border-radius: 4px; background: rgba(90, 82, 237, 0.1); color: var(--primary); border: 1px solid rgba(90, 82, 237, 0.3); height: 28px; display: flex; align-items: center; justify-content: center; width: 28px; min-width: 28px; flex-shrink: 0; cursor: pointer;">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </button>
            </div>
            <span style="font-size:0.75rem; color:var(--text-muted);">ID: ${p._id} (Immutable)</span>
          </div>
        </td>
        <td style="text-transform: capitalize;">${p.category}</td>
        <td>
          ₹<input type="number" value="${p.price}" min="0" style="width:60px; padding:6px;" onchange="updateProductPrice('${p._id}', this.value)">
        </td>
        <td>
          ₹<input type="number" value="${p.cost !== undefined && p.cost !== null ? p.cost : Math.round(p.price * 0.6)}" min="0" style="width:60px; padding:6px;" onchange="updateProductCost('${p._id}', this.value)">
        </td>
        <td>
          ₹<input type="number" value="${p.salePrice !== undefined && p.salePrice !== null ? p.salePrice : ''}" min="0" placeholder="No Sale" style="width:70px; padding:6px;" onchange="updateProductSalePrice('${p._id}', this.value)">
        </td>
        <td>
          <input type="number" value="${p.stock}" min="0" style="width:50px; padding:6px;" onchange="updateStockCount('${p._id}', this.value)">
        </td>
        <td>
          <input type="text" value="${p.sizes ? p.sizes.join(', ') : ''}" style="width:90px; padding:6px;" onchange="updateProductSizes('${p._id}', this.value)">
        </td>
        <td>
          <select style="width:95px; padding:6px;" onchange="updateProductEvent('${p._id}', this.value)">
            <option value="" ${!p.event ? 'selected' : ''}>None</option>
            <option value="birthday" ${p.event === 'birthday' ? 'selected' : ''}>🎂 Birthday</option>
            <option value="wedding" ${p.event === 'wedding' ? 'selected' : ''}>💒 Wedding</option>
            <option value="festival" ${p.event === 'festival' ? 'selected' : ''}>🎉 Festival</option>
            <option value="school" ${p.event === 'school' ? 'selected' : ''}>🏫 School</option>
            <option value="office" ${p.event === 'office' ? 'selected' : ''}>👔 Office</option>
          </select>
        </td>
        <td>
          <label class="toggle-switch-label">
            <input type="checkbox" ${p.available ? 'checked' : ''} onchange="toggleProductAvailability('${p._id}')">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-danger btn-small" onclick="deleteProduct('${p._id}')"><i class="fa-solid fa-trash-can"></i> Delete</button>
        </td>
      </tr>`;
  }).join("");
}

// Base64 helper for image uploads
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

async function triggerEditImage(productId, view) {
  currentEditingProductId = productId;
  currentEditingView = view;
  const input = document.getElementById("adminLiveStockFileUploader");
  if (input) {
    input.value = ""; // Clear file choice
    input.click();
  }
}

async function handleAdminLiveStockPhotoUpload(fileInput) {
  const file = fileInput.files[0];
  if (!file || !currentEditingProductId) return;

  try {
    const base64Image = await convertFileToBase64(file);
    await fetchFromApi(`/api/products/${currentEditingProductId}/image`, {
      method: 'PUT',
      body: JSON.stringify({ 
        image: base64Image,
        view: currentEditingView
      })
    });
    alert(`Product ${currentEditingView} view updated successfully.`);
    await loadAllData();
  } catch (err) {
    alert(`Image update failed: ${err.message}`);
  }
}

async function updateStockCount(productId, count) {
  try {
    await fetchFromApi(`/api/products/${productId}/stock`, {
      method: 'PUT',
      body: JSON.stringify({ stock: parseInt(count) || 0 })
    });
    await loadAllData();
  } catch (err) {
    alert(`Stock update failed: ${err.message}`);
  }
}

async function updateProductPrice(productId, price) {
  try {
    await fetchFromApi(`/api/products/${productId}/price`, {
      method: 'PUT',
      body: JSON.stringify({ price: parseInt(price) || 0 })
    });
    await loadAllData();
  } catch (err) {
    alert(`Price update failed: ${err.message}`);
  }
}

async function updateProductCost(productId, cost) {
  try {
    const operator = currentCustomer ? currentCustomer.name : "Admin";
    await fetchFromApi(`/api/products/${productId}/cost`, {
      method: 'PUT',
      headers: {
        'x-operator': operator
      },
      body: JSON.stringify({ cost: parseInt(cost) || 0 })
    });
    await loadAllData();
  } catch (err) {
    alert(`Cost update failed: ${err.message}`);
  }
}

async function updateProductSalePrice(productId, salePrice) {
  try {
    const val = salePrice.trim() === '' ? null : parseInt(salePrice) || 0;
    await fetchFromApi(`/api/products/${productId}/sale-price`, {
      method: 'PUT',
      body: JSON.stringify({ salePrice: val })
    });
    await loadAllData();
  } catch (err) {
    alert(`Sale price update failed: ${err.message}`);
  }
}

async function updateProductName(productId, name) {
  try {
    await fetchFromApi(`/api/products/${productId}/name`, {
      method: 'PUT',
      body: JSON.stringify({ name: name.trim() })
    });
    await loadAllData();
  } catch (err) {
    alert(`Name update failed: ${err.message}`);
  }
}

async function updateProductSizes(productId, sizesString) {
  try {
    const sizesArray = sizesString.split(',').map(s => s.trim()).filter(Boolean);
    await fetchFromApi(`/api/products/${productId}/sizes`, {
      method: 'PUT',
      body: JSON.stringify({ sizes: sizesArray })
    });
    await loadAllData();
  } catch (err) {
    alert(`Sizes update failed: ${err.message}`);
  }
}

async function updateProductEvent(productId, eventVal) {
  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    await fetchFromApi(`/api/products/${productId}/event`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-operator': adminOperator
      },
      body: JSON.stringify({ event: eventVal })
    });
    await loadAllData();
  } catch (err) {
    alert(`Occasion event update failed: ${err.message}`);
  }
}

async function toggleProductAvailability(productId) {
  try {
    await fetchFromApi(`/api/products/${productId}/availability`, { method: 'PUT' });
    await loadAllData();
  } catch (err) {
    alert(`Availability toggle failed: ${err.message}`);
  }
}

async function deleteProduct(productId) {
  const p = products.find(prod => prod._id === productId);
  const name = p ? p.name : "this product";
  if (confirm(`Are you sure you want to permanently delete "${name}" from stock? This action cannot be undone.`)) {
    try {
      await fetchFromApi(`/api/products/${productId}`, { method: 'DELETE' });
      await loadAllData();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }
}

async function handleNewProductSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("prodName").value.trim();
  const category = document.getElementById("prodCategory").value;
  const price = parseInt(document.getElementById("prodPrice").value) || 0;
  const costVal = document.getElementById("prodCost")?.value?.trim() || "";
  const cost = costVal ? parseInt(costVal) || 0 : Math.round(price * 0.6);
  const salePriceVal = document.getElementById("prodSalePrice").value.trim();
  const salePrice = salePriceVal ? parseInt(salePriceVal) || 0 : null;
  const stock = parseInt(document.getElementById("prodStock").value) || 0;
  const sizesInput = document.getElementById("prodSizes").value.trim();
  const eventVal = document.getElementById("prodEvent")?.value || "";
  const desc = document.getElementById("prodDesc").value.trim();
  
  const fileInput = document.getElementById("prodImageFile");
  if (!fileInput || !fileInput.files[0]) {
    alert("Please upload a product photo!");
    return;
  }

  // Parse custom sizes or fallback to category defaults if empty
  const sizes = sizesInput ? 
                sizesInput.split(',').map(s => s.trim()).filter(Boolean) : 
                (category === 'children' ? ['2-3Y', '4-5Y', '5-6Y'] : 
                 category === 'girls' ? ['S', 'M', 'L', 'XL'] : 
                 ['S', 'M', 'L', 'XL', 'XXL']);

  try {
    const file = fileInput.files[0];
    const base64Image = await convertFileToBase64(file);

    // Parse optional back, side, zoom images
    const backFile = document.getElementById("prodImageFileBack")?.files[0];
    const sideFile = document.getElementById("prodImageFileSide")?.files[0];
    const zoomFile = document.getElementById("prodImageFileZoom")?.files[0];

    const base64ImageBack = backFile ? await convertFileToBase64(backFile) : base64Image;
    const base64ImageSide = sideFile ? await convertFileToBase64(sideFile) : base64Image;
    const base64ImageZoom = zoomFile ? await convertFileToBase64(zoomFile) : base64Image;

    const newProd = {
      name,
      category,
      price,
      cost,
      salePrice,
      image: base64Image,
      imageBack: base64ImageBack,
      imageSide: base64ImageSide,
      imageZoom: base64ImageZoom,
      stock,
      available: stock > 0,
      desc,
      sizes,
      event: eventVal
    };

    await fetchFromApi('/api/products', {
      method: 'POST',
      body: JSON.stringify(newProd)
    });
    document.getElementById("addProductForm").reset();
    alert(`Product ${name} successfully added to database.`);
    await loadAllData();
  } catch (err) {
    alert(`Add stock failed: ${err.message}`);
  }
}

function renderAdminOrders() {
  const tbodyActive = document.getElementById("adminOrdersTableBody");
  const tbodyCancelled = document.getElementById("adminCancelledOrdersTableBody");
  if (!tbodyActive || !tbodyCancelled) return;

  const activeOrders = orders.filter(o => o.status !== "Cancelled");
  const cancelledOrders = orders.filter(o => o.status === "Cancelled");

  // RENDER ACTIVE ORDERS
  if (activeOrders.length === 0) {
    tbodyActive.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">
          No active customer orders found.
        </td>
      </tr>`;
  } else {
    tbodyActive.innerHTML = activeOrders.map(order => {
      const itemsText = order.items.map(item => `${item.name} (${item.qty})`).join(", ");
      
      let actionsHtml = "";
      const s = order.status;
      if (s === "Order Received" || s === "Pending" || s === "Paid & Ordered") {
        actionsHtml = `
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-success btn-small" style="padding: 4px 10px; font-size: 0.75rem;" onclick="updateOrderStatus('${order._id}', 'Confirmed')">Accept</button>
            <button class="btn btn-danger btn-small" style="padding: 4px 10px; font-size: 0.75rem;" onclick="adminRejectOrder('${order._id}')">Reject</button>
          </div>
        `;
      } else if (s === "Confirmed") {
        actionsHtml = `
          <button class="btn btn-primary btn-small" style="padding: 4px 10px; font-size: 0.75rem;" onclick="updateOrderStatus('${order._id}', 'Packed')">Pack</button>
        `;
      } else if (s === "Packed") {
        actionsHtml = `
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-small" style="padding: 4px 10px; font-size: 0.75rem;" onclick="updateOrderStatus('${order._id}', 'Shipped')">Ship (Manual)</button>
            <button class="btn btn-primary btn-small" style="padding: 4px 10px; font-size: 0.75rem; background: #e71d36; border-color: transparent;" onclick="shipViaDelhivery('${order._id}')"><i class="fa-solid fa-truck-fast"></i> Delhivery Ship</button>
          </div>
        `;
      } else if (s === "Shipped") {
        let labelButton = "";
        if (order.trackingCourier === "Delhivery" && order.delhiveryWaybill) {
          labelButton = `
            <a href="/api/orders/${order._id}/delhivery-label" target="_blank" class="btn btn-secondary btn-small" style="padding: 4px 10px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; background: #0f172a; color: white; border: none;">
              <i class="fa-solid fa-print"></i> Print Label
            </a>
          `;
        }
        actionsHtml = `
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-primary btn-small" style="padding: 4px 10px; font-size: 0.75rem;" onclick="updateOrderStatus('${order._id}', 'Out for Delivery')">Out for Delivery</button>
            ${labelButton}
          </div>
        `;
      } else if (s === "Out for Delivery") {
        actionsHtml = `
          <button class="btn btn-success btn-small" style="padding: 4px 10px; font-size: 0.75rem;" onclick="updateOrderStatus('${order._id}', 'Delivered')">Deliver</button>
        `;
      } else {
        actionsHtml = `
          <span style="font-weight: 700; color: #2ec4b6; font-size: 0.8rem;"><i class="fa-solid fa-circle-check"></i> ${s}</span>
        `;
      }

      // Proof of payment rendering
      let proofHtml = "";
      if (order.transactionId || order.paymentScreenshot) {
        proofHtml = `
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem;">
            ${order.transactionId ? `<div><strong>UTR:</strong> <span style="font-family: monospace; font-weight: 600; color: var(--text);">${order.transactionId}</span></div>` : ""}
            ${order.paymentScreenshot ? `
              <button class="btn btn-secondary btn-small" style="padding: 2px 6px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px; border-radius: 4px; width: max-content; border-color: rgba(90, 82, 237, 0.2);" onclick="showPaymentProofModal('${order.orderId}')">
                <i class="fa-solid fa-image"></i> View Receipt
              </button>
            ` : ""}
          </div>
        `;
      } else {
        proofHtml = `<span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">None provided</span>`;
      }

      return `
        <tr>
          <td style="font-weight: 700;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${order.orderId}</span>
              <button class="btn btn-secondary btn-small" style="padding: 2px 6px; font-size: 0.75rem; border-color: transparent;" title="Download PDF Invoice" onclick="downloadInvoice('${order.orderId}')"><i class="fa-solid fa-file-pdf"></i></button>
            </div>
          </td>
          <td>${order.customerName}</td>
          <td>${order.customerPhone}</td>
          <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsText}">
            ${itemsText}
          </td>
          <td style="font-weight: 600; color: var(--primary);">₹${order.subtotal}</td>
          <td>
            ${proofHtml}
          </td>
          <td>
            ${actionsHtml}
          </td>
        </tr>`;
    }).join("");
  }

  // RENDER CANCELLED ORDERS
  if (cancelledOrders.length === 0) {
    tbodyCancelled.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 20px; color: var(--text-muted);">
          No cancelled orders found.
        </td>
      </tr>`;
  } else {
    tbodyCancelled.innerHTML = cancelledOrders.map(order => {
      const itemsText = order.items.map(item => `${item.name} (${item.qty})`).join(", ");
      
      let proofHtml = "";
      if (order.transactionId || order.paymentScreenshot) {
        proofHtml = `
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem;">
            ${order.transactionId ? `<div><strong>UTR:</strong> <span style="font-family: monospace; font-weight: 600;">${order.transactionId}</span></div>` : ""}
            ${order.paymentScreenshot ? `
              <button class="btn btn-secondary btn-small" style="padding: 2px 6px; font-size: 0.7rem; display: flex; align-items: center; gap: 4px; border-radius: 4px; width: max-content; border-color: rgba(90, 82, 237, 0.2);" onclick="showPaymentProofModal('${order.orderId}')">
                <i class="fa-solid fa-image"></i> View Receipt
              </button>
            ` : ""}
          </div>
        `;
      } else {
        proofHtml = `<span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">None provided</span>`;
      }

      return `
        <tr>
          <td style="font-weight: 700;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${order.orderId}</span>
              <button class="btn btn-secondary btn-small" style="padding: 2px 6px; font-size: 0.75rem; border-color: transparent;" title="Download PDF Invoice" onclick="downloadInvoice('${order.orderId}')"><i class="fa-solid fa-file-pdf"></i></button>
            </div>
          </td>
          <td>${order.customerName}</td>
          <td>${order.customerPhone}</td>
          <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsText}">
            ${itemsText}
          </td>
          <td style="font-weight: 600; color: var(--text-muted);">₹${order.subtotal}</td>
          <td>
            ${proofHtml}
          </td>
          <td style="color: #e71d36; font-weight: 500; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${order.cancelReason || ''}">
            ${order.cancelReason || 'Not specified'}
          </td>
        </tr>`;
    }).join("");
  }
}

function showPaymentProofModal(orderId) {
  const order = orders.find(o => o.orderId === orderId);
  if (!order) return;

  const infoEl = document.getElementById("paymentProofInfo");
  if (infoEl) {
    infoEl.innerHTML = `
      <strong>Order ID:</strong> ${order.orderId}<br>
      <strong>Customer:</strong> ${order.customerName} (${order.customerPhone})<br>
      <strong>Amount:</strong> ₹${order.subtotal}<br>
      ${order.transactionId ? `<strong>Transaction ID / UTR:</strong> ${order.transactionId}` : `<strong>Transaction ID / UTR:</strong> Not provided`}
    `;
  }

  const imgEl = document.getElementById("paymentProofImage");
  if (imgEl) {
    imgEl.src = order.paymentScreenshot || "";
  }

  const container = document.getElementById("paymentProofImageContainer");
  if (container) {
    container.style.display = order.paymentScreenshot ? "flex" : "none";
  }

  document.getElementById("paymentProofModalBackdrop").classList.add("active");
}

function closePaymentProofModal() {
  document.getElementById("paymentProofModalBackdrop").classList.remove("active");
}

async function updateOrderStatus(orderId, status) {
  let courier = "";
  let trackingNum = "";
  if (status === "Shipped") {
    courier = prompt("Enter Courier/Delivery Partner (e.g. Jalalpur Local Delivery, Delhivery, Blue Dart):");
    if (courier !== null) {
      courier = courier.trim();
      trackingNum = prompt("Enter Tracking ID / Number:");
      if (trackingNum !== null) {
        trackingNum = trackingNum.trim();
      }
    } else {
      // User clicked cancel, reload UI to reset dropdown selection
      loadAllData();
      return;
    }
  }

  try {
    await fetchFromApi(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, courier, trackingNum })
    });
    alert(`Order status updated to: ${status}`);
    await loadAllData();
  } catch (err) {
    alert(`Order status update failed: ${err.message}`);
  }
}

async function adminRejectOrder(orderId) {
  const reason = prompt("Enter reason for rejection/cancellation:");
  if (reason === null) return;
  const cleanReason = reason.trim() || "Rejected by Admin";
  try {
    await fetchFromApi(`/api/orders/${orderId}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason: cleanReason })
    });
    alert("Order rejected and cancelled successfully.");
    await loadAllData();
  } catch (err) {
    alert(`Failed to reject order: ${err.message}`);
  }
}

function renderAdminExchanges() {
  const tbody = document.getElementById("adminExchangesTableBody");
  if (!tbody) return;

  if (exchanges.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No exchange logs found.</td></tr>`;
    return;
  }

  tbody.innerHTML = exchanges.map(ex => {
    const count = ex.updateCount || 0;
    let actionHtml = "";
    
    if (count === 0 || ex.status === "Pending Admin Approval") {
      actionHtml = `
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-primary btn-small" style="padding: 4px 8px;" onclick="handleExchangeAction('${ex.exchangeId}', 'Approved')">Approve</button>
          <button class="btn btn-secondary btn-small" style="padding: 4px 8px;" onclick="handleExchangeAction('${ex.exchangeId}', 'Rejected')">Reject</button>
        </div>`;
    } else if (count === 1) {
      if (ex.status === "Approved") {
        actionHtml = `
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
            <button class="btn btn-secondary btn-small" style="padding: 4px 8px;" onclick="handleExchangeAction('${ex.exchangeId}', 'Rejected')">Reject</button>
            <span style="font-size:0.7rem; color:var(--text-muted);">Toggle decision (1/2 changes)</span>
          </div>`;
      } else {
        actionHtml = `
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
            <button class="btn btn-primary btn-small" style="padding: 4px 8px;" onclick="handleExchangeAction('${ex.exchangeId}', 'Approved')">Approve</button>
            <span style="font-size:0.7rem; color:var(--text-muted);">Toggle decision (1/2 changes)</span>
          </div>`;
      }
    } else {
      actionHtml = `<span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;"><i class="fa-solid fa-lock"></i> Logged (Locked)</span>`;
    }

    const feedbackText = ex.adminFeedback ? `<br><span style="color:#e71d36; font-size:0.8rem; font-weight:500;">Feedback: "${ex.adminFeedback}"</span>` : "";

    return `
      <tr>
        <td>${ex.orderId}</td>
        <td>${ex.productName}</td>
        <td style="text-transform: capitalize; font-size:0.85rem;">${ex.reason.replace(/-/g, ' ')}</td>
        <td>
          <small>${ex.details}</small>
          ${feedbackText}
        </td>
        <td><span class="order-status-badge">${ex.status}</span></td>
        <td>${actionHtml}</td>
      </tr>`;
  }).join("");
}

async function handleExchangeAction(exchangeId, finalStatus) {
  let feedback = "";
  if (finalStatus === "Rejected") {
    feedback = prompt("Enter rejection feedback/reason for the customer:");
    if (feedback === null) return; // User cancelled prompt
    feedback = feedback.trim();
    if (!feedback) {
      alert("Feedback is required to reject an exchange.");
      return;
    }
  }

  try {
    await fetchFromApi(`/api/exchanges/${exchangeId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: finalStatus, feedback: feedback })
    });
    alert(`Exchange status updated to: ${finalStatus}`);
    await loadAllData();
  } catch (err) {
    alert(`Update action failed: ${err.message}`);
  }
}

function renderAdminReviews() {
  const container = document.getElementById("adminReviewsList");
  if (!container) return;

  if (reviews.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">No reviews registered.</div>`;
    return;
  }

  container.innerHTML = reviews.map(rev => {
    let starIcons = "";
    for (let i = 1; i <= 5; i++) {
      starIcons += i <= rev.rating ? `<i class="fa-solid fa-star"></i>` : `<i class="fa-regular fa-star"></i>`;
    }

    const statusBadge = rev.approved ? 
      `<span class="order-status-badge" style="background-color: #e6fced; color: #0ea735; margin-right: 8px;">Approved</span>` : 
      `<span class="order-status-badge" style="background-color: #fff9db; color: #f59f00; margin-right: 8px;">Pending Approval</span>`;

    const approveButton = !rev.approved ? 
      `<button class="btn btn-primary btn-small" style="padding: 4px 8px; font-size: 0.75rem;" onclick="approveReview('${rev._id}')"><i class="fa-solid fa-check"></i> Approve</button>` : '';

    return `
      <div class="review-item" style="background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 15px; margin-bottom: 10px;">
        <div class="review-item-header" style="align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
          <div>
            <strong class="review-item-title" style="font-size: 0.95rem; color: var(--text);">${rev.productName}</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">Order ID: ${rev.orderId}</span>
          </div>
          <div style="display: flex; align-items: center;">
            ${statusBadge}
            <span class="review-stars" style="color: #f59f00; font-size: 0.85rem;">${starIcons}</span>
          </div>
        </div>
        <p class="review-comment" style="color: var(--text-muted); margin-bottom: 12px; margin-top: 6px; font-size: 0.85rem;">"${rev.comment}"</p>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted);">
          <span>Date: ${rev.date}</span>
          <div style="display: flex; gap: 6px;">
            ${approveButton}
            <button class="btn btn-secondary btn-small" style="padding: 4px 8px; font-size: 0.75rem; color: #e71d36; border-color: transparent;" onclick="deleteReview('${rev._id}')">
              <i class="fa-solid fa-trash-can"></i> Delete
            </button>
          </div>
        </div>
      </div>`;
  }).join("");
}

async function approveReview(id) {
  try {
    await fetchFromApi(`/api/reviews/${id}/approve`, {
      method: 'PUT'
    });
    alert("Review approved successfully! It will now be visible on the storefront.");
    await loadAllData();
  } catch (err) {
    alert(`Failed to approve review: ${err.message}`);
  }
}

async function deleteReview(id) {
  if (confirm("Are you sure you want to permanently delete this review from the database?")) {
    try {
      await fetchFromApi(`/api/reviews/${id}`, {
        method: 'DELETE'
      });
      alert("Review deleted successfully.");
      await loadAllData();
    } catch (err) {
      alert(`Failed to delete review: ${err.message}`);
    }
  }
}

function renderAdminCustomers() {
  const tbody = document.getElementById("adminCustomersTableBody");
  if (!tbody) return;

  const searchInput = document.getElementById("adminCustomerSearchInput");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

  const customersMap = {};

  // Loop orders oldest-to-newest so the latest customerName overrides previous ones
  for (let i = orders.length - 1; i >= 0; i--) {
    const order = orders[i];
    if (!order.customerPhone) continue;

    const phone = order.customerPhone.replace(/\D/g, "");
    if (phone.length !== 10) continue;

    if (order.status === "Cancelled") continue; // Exclude cancelled orders from customer spend stats

    if (!customersMap[phone]) {
      customersMap[phone] = {
        name: order.customerName,
        phone: phone,
        totalOrders: 0,
        totalSpend: 0
      };
    }

    customersMap[phone].name = order.customerName;
    customersMap[phone].totalOrders += 1;
    customersMap[phone].totalSpend += (order.subtotal - (order.loyaltyDiscount || 0)) || 0;
  }

  let customerList = Object.values(customersMap);

  if (query) {
    customerList = customerList.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.phone.includes(query)
    );
  }

  // Sort by total spend descending
  customerList.sort((a, b) => b.totalSpend - a.totalSpend);

  if (customerList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">
          No customers found.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = customerList.map(c => `
    <tr>
      <td style="font-weight: 600;">${c.name}</td>
      <td>${c.phone}</td>
      <td style="text-align: center;">${c.totalOrders}</td>
      <td style="text-align: right; padding-right: 20px; font-weight: 600; color: var(--primary);">₹${c.totalSpend}</td>
      <td style="text-align: center;">
        <button class="btn btn-primary btn-small" style="padding: 4px 10px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;" onclick="viewCustomerHistory('${c.phone}')">
          <i class="fa-solid fa-eye"></i> View History
        </button>
      </td>
    </tr>
  `).join("");
}

function viewCustomerHistory(phone) {
  const cleanSearchPhone = phone.replace(/\D/g, "");

  const customerOrders = orders.filter(order => {
    if (!order.customerPhone) return false;
    return order.customerPhone.replace(/\D/g, "") === cleanSearchPhone;
  });

  if (customerOrders.length === 0) {
    alert("No orders found for this customer phone!");
    return;
  }

  const customerName = customerOrders[0].customerName;
  const activeOrders = customerOrders.filter(o => o.status !== "Cancelled");
  const totalOrders = activeOrders.length;
  const totalSpend = activeOrders.reduce((sum, o) => sum + ((o.subtotal - (o.loyaltyDiscount || 0)) || 0), 0);

  document.getElementById("histCustomerName").textContent = customerName;
  document.getElementById("histCustomerPhone").textContent = `Phone: ${phone}`;
  document.getElementById("histTotalSpend").textContent = `₹${totalSpend}`;
  document.getElementById("histTotalOrders").textContent = totalOrders;

  const listContainer = document.getElementById("customerHistoryOrdersList");
  
  // Sort customerOrders newest first
  customerOrders.sort((a, b) => b._id.toString().localeCompare(a._id.toString()));

  listContainer.innerHTML = customerOrders.map(order => {
    const itemsHtml = order.items.map(item => {
      return `
        <div style="display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border);">
          <img src="${item.image}" alt="${item.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" onerror="this.src='https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=100'">
          <div style="flex-grow: 1;">
            <span style="font-weight: 500; font-size: 0.85rem; display: block; color: var(--text);">${item.name}</span>
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Qty: ${item.qty}</span>
          <span style="font-weight: 600; font-size: 0.85rem; min-width: 60px; text-align: right; color: var(--text);">₹${item.price * item.qty}</span>
        </div>
      `;
    }).join("");

    return `
      <div style="border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 15px; margin-bottom: 15px; background-color: var(--bg-card);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; border-bottom: 1px dashed var(--border); padding-bottom: 8px;">
          <div>
            <strong style="color: var(--primary); font-size: 0.95rem;">ID: ${order.orderId}</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">${order.date}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary btn-small" style="padding: 2px 6px; font-size: 0.75rem; border-color: transparent;" onclick="downloadInvoice('${order.orderId}')" title="Download Invoice">
              <i class="fa-solid fa-file-pdf"></i>
            </button>
            <span class="order-status-badge">${order.status}</span>
          </div>
        </div>
        
        <div style="margin-bottom: 10px;">
          ${itemsHtml}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; padding-top: 5px; color: var(--text-muted);">
          <div>
            <strong>Delivery:</strong> ${order.delivery === 'pickup' ? 'Shop Pickup' : 'Home Delivery'}
          </div>
          <div style="color: var(--text);">
            <strong>Total Paid:</strong> <span style="font-weight: 700; color: var(--primary); font-size: 1rem;">₹${order.subtotal}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("customerHistoryModalBackdrop").classList.add("active");
}

function closeCustomerHistoryModal() {
  document.getElementById("customerHistoryModalBackdrop").classList.remove("active");
}

function parseOrderDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      // Day, Month (0-indexed), Year
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }
  // Try native date parsing (strip time part if any)
  const cleanStr = dateStr.split(",")[0];
  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date(); // fallback
}

function renderAdminAnalytics() {
  const canvas = document.getElementById("salesChartCanvas");
  if (!canvas) return; // only run inside admin page

  const activeOrders = orders.filter(o => o.status !== "Cancelled");

  // 1. Calculate and update Analytics Stats (Revenue, Cost, Profit, Margin)
  const totalRevenue = activeOrders.reduce((sum, o) => sum + ((o.subtotal - (o.loyaltyDiscount || 0)) || 0), 0);
  const totalCost = activeOrders.reduce((sum, o) => sum + o.items.reduce((itemSum, item) => {
    const prod = products.find(p => p._id === item.productId);
    const itemCost = (prod && prod.cost && prod.cost > 0) ? prod.cost : Math.round((prod ? prod.price : item.price) * 0.6);
    return itemSum + (itemCost * (item.qty || 1));
  }, 0), 0);
  const netProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  const revenueEl = document.getElementById("adminAnalyticsRevenue");
  if (revenueEl) {
    revenueEl.textContent = `₹${totalRevenue.toLocaleString('en-IN')}`;
  }
  const costEl = document.getElementById("adminAnalyticsCost");
  if (costEl) {
    costEl.textContent = `₹${totalCost.toLocaleString('en-IN')}`;
  }
  const profitEl = document.getElementById("adminAnalyticsProfit");
  if (profitEl) {
    profitEl.textContent = `₹${netProfit.toLocaleString('en-IN')}`;
  }
  const marginEl = document.getElementById("adminAnalyticsMargin");
  if (marginEl) {
    marginEl.textContent = `${profitMargin}%`;
  }

  // 2. Calculate Top Selling Products
  const productsMap = {};
  activeOrders.forEach(order => {
    order.items.forEach(item => {
      // Remove size suffix if any
      const name = item.name.split(" (Size:")[0];
      if (!productsMap[name]) {
        productsMap[name] = {
          name: name,
          image: item.image,
          qtySold: 0,
          revenue: 0
        };
      }
      productsMap[name].qtySold += item.qty || 0;
      productsMap[name].revenue += (item.price * item.qty) || 0;
    });
  });

  let topSellers = Object.values(productsMap);
  topSellers.sort((a, b) => b.qtySold - a.qtySold);
  const topSellersList = topSellers.slice(0, 5);

  const topSellersContainer = document.getElementById("adminTopSellingList");
  if (topSellersContainer) {
    if (topSellersList.length === 0) {
      topSellersContainer.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; text-align: center; padding: 20px;">No sales data available yet.</p>`;
    } else {
      topSellersContainer.innerHTML = topSellersList.map((item, idx) => `
        <div style="display: flex; align-items: center; gap: 15px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background-color: var(--bg-card);">
          <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-muted); min-width: 20px; text-align: center;">#${idx + 1}</div>
          <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px;" onerror="this.src='https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?auto=format&fit=crop&q=80&w=100'">
          <div style="flex-grow: 1; min-width: 0;">
            <h4 style="font-size: 0.9rem; font-weight: 600; margin: 0; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</h4>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Revenue: ₹${item.revenue}</span>
          </div>
          <div style="text-align: right; min-width: 60px;">
            <span style="font-weight: 700; color: var(--primary); font-size: 0.95rem;">${item.qtySold} sold</span>
          </div>
        </div>
      `).join("");
    }
  }

  // 3. Render Sales Chart using Chart.js
  let labels = [];
  let values = [];
  const now = new Date();

  if (currentSalesTimescale === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      labels.push(dateStr);
      
      let daySales = 0;
      activeOrders.forEach(order => {
        const orderDate = parseOrderDate(order.date);
        if (orderDate.toDateString() === d.toDateString()) {
          daySales += (order.subtotal - (order.loyaltyDiscount || 0)) || 0;
        }
      });
      values.push(daySales);
    }
  } else if (currentSalesTimescale === 'weekly') {
    labels = ['4 Weeks Ago', '3 Weeks Ago', '2 Weeks Ago', 'Last Week'];
    values = [0, 0, 0, 0];
    activeOrders.forEach(order => {
      const orderDate = parseOrderDate(order.date);
      const diffTime = now - orderDate;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      const orderVal = (order.subtotal - (order.loyaltyDiscount || 0)) || 0;
      if (diffDays >= 0 && diffDays < 7) {
        values[3] += orderVal;
      } else if (diffDays >= 7 && diffDays < 14) {
        values[2] += orderVal;
      } else if (diffDays >= 14 && diffDays < 21) {
        values[1] += orderVal;
      } else if (diffDays >= 21 && diffDays < 28) {
        values[0] += orderVal;
      }
    });
  } else if (currentSalesTimescale === 'monthly') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      labels.push(monthLabel);
      
      let monthSales = 0;
      activeOrders.forEach(order => {
        const orderDate = parseOrderDate(order.date);
        if (orderDate.getMonth() === d.getMonth() && orderDate.getFullYear() === d.getFullYear()) {
          monthSales += (order.subtotal - (order.loyaltyDiscount || 0)) || 0;
        }
      });
      values.push(monthSales);
    }
  }

  // Destroy previous chart to redraw cleanly
  if (salesChart) {
    salesChart.destroy();
  }

  const ctx = canvas.getContext("2d");
  
  // Custom design configurations to fit light/dark modes
  const isDark = document.body.classList.contains("dark-theme");
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
  const labelColor = isDark ? "#a3b3c6" : "#64748b";

  salesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales Revenue (₹)',
        data: values,
        backgroundColor: 'rgba(0, 112, 243, 0.85)',
        hoverBackgroundColor: 'rgba(0, 112, 243, 1)',
        borderColor: 'rgba(0, 112, 243, 1)',
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1a2333' : '#ffffff',
          titleColor: isDark ? '#ffffff' : '#1a2333',
          bodyColor: 'rgba(0, 112, 243, 1)',
          borderColor: 'rgba(0, 112, 243, 0.2)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return ` Revenue: ₹${context.raw.toLocaleString('en-IN')}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor
          },
          ticks: {
            color: labelColor,
            font: {
              family: "'Outfit', sans-serif",
              size: 11
            },
            callback: function(value) {
              return '₹' + value;
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: labelColor,
            font: {
              family: "'Outfit', sans-serif",
              size: 11,
              weight: '500'
            }
          }
        }
      }
    }
  });
}

function setSalesTimescale(timescale) {
  currentSalesTimescale = timescale;

  // Toggle button active classes
  const buttons = ['daily', 'weekly', 'monthly'];
  buttons.forEach(btn => {
    const el = document.getElementById(`btn-sales-${btn}`);
    if (el) {
      if (btn === timescale) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    }
  });

  renderAdminAnalytics();
}

// ==========================================================================
// AI Try-on & Chatbot
// ==========================================================================

let isCustomPhotoActive = false;
let garmentOffsetX = 0;
let garmentOffsetY = 0;
let garmentScale = 1;
let activeCameraStream = null;

function selectAvatar(avatarType) {
  stopCameraStream(); // Stop webcam stream if running
  activeAvatar = avatarType;
  const holder = document.getElementById("avatarImageHolder");
  if (!holder) return;

  holder.innerHTML = AVATARS[avatarType];

  const avatarButtons = document.querySelectorAll(".avatar-select-bar button");
  avatarButtons.forEach(btn => {
    const isMatched = btn.id === `btn-avatar-${avatarType}`;
    if (isMatched) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  const overlay = document.getElementById("garmentOverlay");
  overlay.className = "garment-overlay";
  overlay.style.backgroundImage = "none";
  activeGarmentProduct = null;
  document.getElementById("tryOnAddToCartBtn").style.display = "none";

  // Hide position controls
  document.getElementById("garmentAdjustControls").style.display = "none";
  isCustomPhotoActive = false;
  resetGarmentPosition();

  updateSelectedGarmentOptionBorder();
}

function handleUserPhotoUpload(event) {
  stopCameraStream(); // Stop webcam stream if running
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const holder = document.getElementById("avatarImageHolder");
    if (holder) {
      holder.innerHTML = `<img src="${e.target.result}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius: var(--radius-sm);" alt="User custom upload">`;
    }

    // De-activate model buttons
    const avatarButtons = document.querySelectorAll(".avatar-select-bar button");
    avatarButtons.forEach(btn => btn.classList.remove("active"));
    
    // Set uploader states
    isCustomPhotoActive = true;
    
    // Show manual coordinate adjustment tools if a garment is active
    if (activeGarmentProduct) {
      document.getElementById("garmentAdjustControls").style.display = "flex";
    }
    
    // Clear overlay garment
    const overlay = document.getElementById("garmentOverlay");
    overlay.className = "garment-overlay";
    overlay.style.backgroundImage = "none";
    activeGarmentProduct = null;
    document.getElementById("tryOnAddToCartBtn").style.display = "none";
    resetGarmentPosition();
  };
  reader.readAsDataURL(file);
}

// Device Webcam Streaming & Snapshot Capturing
async function openCamera() {
  stopCameraStream(); // Reset any existing stream
  
  const holder = document.getElementById("avatarImageHolder");
  if (!holder) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
    });
    
    activeCameraStream = stream;
    isCustomPhotoActive = true;

    // De-activate model buttons
    const avatarButtons = document.querySelectorAll(".avatar-select-bar button");
    avatarButtons.forEach(btn => btn.classList.remove("active"));

    // Render HTML5 Video element in the canvas holder
    holder.innerHTML = `<video id="webcamVideo" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm);"></video>`;
    const videoEl = document.getElementById("webcamVideo");
    videoEl.srcObject = stream;

    // Hide controls until user clicks the photo
    document.getElementById("garmentAdjustControls").style.display = "none";

    // Clear overlay garment
    const overlay = document.getElementById("garmentOverlay");
    if (overlay) {
      overlay.className = "garment-overlay";
      overlay.style.backgroundImage = "none";
    }
    activeGarmentProduct = null;
    document.getElementById("tryOnAddToCartBtn").style.display = "none";
    resetGarmentPosition();

    // Create / Show float webcam capture button overlay
    let captureBtn = document.getElementById("webcamCaptureBtn");
    if (!captureBtn) {
      captureBtn = document.createElement("button");
      captureBtn.id = "webcamCaptureBtn";
      captureBtn.className = "btn btn-primary";
      captureBtn.style.position = "absolute";
      captureBtn.style.bottom = "20px";
      captureBtn.style.zIndex = "25";
      captureBtn.innerHTML = `<i class="fa-solid fa-camera"></i> Click Snapshot`;
      captureBtn.onclick = capturePhoto;
      document.getElementById("mannequinWrapper").appendChild(captureBtn);
    }
    captureBtn.style.display = "inline-flex";
  } catch (err) {
    console.error("Camera access error:", err);
    alert("Unable to access device camera. Please check your browser permission settings or upload a saved photo instead.");
  }
}

function capturePhoto() {
  const videoEl = document.getElementById("webcamVideo");
  const holder = document.getElementById("avatarImageHolder");
  if (!videoEl || !holder) return;

  // Create canvas to grab video snapshot frame
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth || 640;
  canvas.height = videoEl.videoHeight || 480;

  const ctx = canvas.getContext("2d");
  // Flip image horizontally for a mirror effect (typical for front cams)
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg");
  holder.innerHTML = `<img src="${dataUrl}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius: var(--radius-sm);" alt="User clicked snapshot">`;

  stopCameraStream();

  // Show manual controls if garment is active
  if (activeGarmentProduct) {
    document.getElementById("garmentAdjustControls").style.display = "flex";
  }
}

function stopCameraStream() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  const video = document.getElementById("webcamVideo");
  if (video) video.remove();
  
  const captureBtn = document.getElementById("webcamCaptureBtn");
  if (captureBtn) captureBtn.remove();
}

// Drag & Drop Mechanics for fitting clothes overlays directly
function initDraggableGarment() {
  const overlay = document.getElementById("garmentOverlay");
  if (!overlay) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let startOffsetY = 0;

  // Mouse Drag Events
  overlay.addEventListener("mousedown", (e) => {
    if (!activeGarmentProduct) return;
    isDragging = true;
    overlay.classList.add("dragging");
    startX = e.clientX;
    startY = e.clientY;
    startOffsetX = garmentOffsetX;
    startOffsetY = garmentOffsetY;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    garmentOffsetX = startOffsetX + dx;
    garmentOffsetY = startOffsetY + dy;
    overlay.style.transform = `translate(${garmentOffsetX}px, ${garmentOffsetY}px) scale(${garmentScale})`;
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      overlay.classList.remove("dragging");
    }
  });

  // Mobile Touch Drag Events
  overlay.addEventListener("touchstart", (e) => {
    if (!activeGarmentProduct) return;
    isDragging = true;
    overlay.classList.add("dragging");
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startOffsetX = garmentOffsetX;
    startOffsetY = garmentOffsetY;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    garmentOffsetX = startOffsetX + dx;
    garmentOffsetY = startOffsetY + dy;
    overlay.style.transform = `translate(${garmentOffsetX}px, ${garmentOffsetY}px) scale(${garmentScale})`;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (isDragging) {
      isDragging = false;
      overlay.classList.remove("dragging");
    }
  });
}

// Fitting sizing controls (plus, minus, sliders)
function adjustGarmentScale(val) {
  garmentScale = parseFloat(val);
  const valLabel = document.getElementById("scaleSliderVal");
  if (valLabel) valLabel.textContent = `${Math.round(garmentScale * 100)}%`;
  
  const overlay = document.getElementById("garmentOverlay");
  if (overlay) {
    overlay.style.transform = `translate(${garmentOffsetX}px, ${garmentOffsetY}px) scale(${garmentScale})`;
  }
}

function updateScaleSliderUI() {
  const slider = document.getElementById("garmentScaleSlider");
  const valLabel = document.getElementById("scaleSliderVal");
  if (slider) slider.value = garmentScale;
  if (valLabel) valLabel.textContent = `${Math.round(garmentScale * 100)}%`;
}

function adjustGarment(action) {
  if (!activeGarmentProduct) return;
  const overlay = document.getElementById("garmentOverlay");
  if (!overlay) return;

  switch (action) {
    case 'up':
      garmentOffsetY -= 5;
      break;
    case 'down':
      garmentOffsetY += 5;
      break;
    case 'left':
      garmentOffsetX -= 5;
      break;
    case 'right':
      garmentOffsetX += 5;
      break;
    case 'scale-up':
      garmentScale += 0.05;
      if (garmentScale > 4.0) garmentScale = 4.0;
      updateScaleSliderUI();
      break;
    case 'scale-down':
      garmentScale -= 0.05;
      if (garmentScale < 0.2) garmentScale = 0.2;
      updateScaleSliderUI();
      break;
  }

  overlay.style.transform = `translate(${garmentOffsetX}px, ${garmentOffsetY}px) scale(${garmentScale})`;
}

function resetGarmentPosition() {
  garmentOffsetX = 0;
  garmentOffsetY = 0;
  garmentScale = 1;
  const overlay = document.getElementById("garmentOverlay");
  if (overlay) {
    overlay.style.transform = `translate(0px, 0px) scale(1)`;
  }
  updateScaleSliderUI();
}

function initTryOnGarments() {
  const container = document.getElementById("tryOnGarmentsGrid");
  if (!container) return;

  container.innerHTML = products.map(p => {
    return `
      <div class="garment-option" id="garment-opt-${p._id}" onclick="applyTryOn('${p._id}')" title="Try on ${p.name}">
        <img src="${p.image}" alt="${p.name}">
      </div>`;
  }).join("");
}

// Dynamic background transparent cutout keying using BFS flood fill
function makeOuterBackgroundTransparent(imgUrl, callback) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = function() {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const width = canvas.width;
    const height = canvas.height;

    // BFS Queue and Visited trackers
    const visited = new Uint8Array(width * height);
    const queue = [];

    // Add all border pixels to queue
    for (let x = 0; x < width; x++) {
      queue.push(x, 0);
      queue.push(x, height - 1);
      visited[x] = 1;
      visited[x + (height - 1) * width] = 1;
    }
    for (let y = 1; y < height - 1; y++) {
      queue.push(0, y);
      queue.push(width - 1, y);
      visited[y * width] = 1;
      visited[width - 1 + y * width] = 1;
    }

    // BFS traversal
    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++];
      const cy = queue[head++];
      const idx = (cx + cy * width) * 4;

      const r = data[idx];
      const g = data[idx+1];
      const b = data[idx+2];

      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const diff = maxVal - minVal;
      
      // Neutral light beige/gray/white check
      const isLightBg = (r > 225 && g > 225 && b > 220);
      const isLowSat = diff < 15;

      if (isLightBg && isLowSat) {
        data[idx+3] = 0; // Make transparent

        // Check 4-connected neighbors
        const dx = [0, 0, -1, 1];
        const dy = [-1, 1, 0, 0];
        for (let i = 0; i < 4; i++) {
          const nx = cx + dx[i];
          const ny = cy + dy[i];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = nx + ny * width;
            if (!visited[nIdx]) {
              visited[nIdx] = 1;
              queue.push(nx, ny);
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    callback(canvas.toDataURL());
  };
  img.onerror = function() {
    callback(imgUrl);
  };
  img.src = imgUrl;
}

function applyTryOn(productId) {
  const p = products.find(prod => prod._id === productId);
  if (!p) return;

  activeGarmentProduct = p;
  resetGarmentPosition();

  // Trigger AI Scanning glowing laser bar animation
  const scanBar = document.getElementById("aiScanBar");
  if (scanBar) {
    scanBar.classList.remove("scanning");
    void scanBar.offsetWidth; // Force element reflow in DOM to replay keyframe
    scanBar.classList.add("scanning");
  }

  const overlay = document.getElementById("garmentOverlay");
  if (overlay) {
    // Process image to remove background before displaying!
    makeOuterBackgroundTransparent(p.image, (processedUrl) => {
      overlay.style.backgroundImage = `url('${processedUrl}')`;
      overlay.className = "garment-overlay active";
    });
  }

  // Positioning presets
  if (p.category === "children") {
    overlay.style.top = "30%";
    overlay.style.height = "42%";
    overlay.style.width = "40%";
    overlay.style.left = "30%";
  } else if (p.category === "girls") {
    overlay.style.top = "24%";
    overlay.style.height = "60%";
    overlay.style.width = "48%";
    overlay.style.left = "26%";
  } else {
    overlay.style.top = "26%";
    overlay.style.height = "42%";
    overlay.style.width = "46%";
    overlay.style.left = "27%";
  }

  document.getElementById("tryOnAddToCartBtn").style.display = "inline-flex";
  // Display fitting controls whenever a garment is tried on
  document.getElementById("garmentAdjustControls").style.display = "flex";
  updateSelectedGarmentOptionBorder();
}

function updateSelectedGarmentOptionBorder() {
  const options = document.querySelectorAll(".garment-option");
  options.forEach(opt => opt.classList.remove("selected"));

  if (activeGarmentProduct) {
    const activeOpt = document.getElementById(`garment-opt-${activeGarmentProduct._id}`);
    if (activeOpt) activeOpt.classList.add("selected");
  }
}

function addActiveGarmentToCart() {
  if (!currentCustomer) {
    alert("Please login to add items to your cart.");
    openProfileOrLoginModal();
    return;
  }
  if (activeGarmentProduct) {
    addToCart(activeGarmentProduct._id);
  }
}

function sendAiMessage() {
  const input = document.getElementById("aiChatInput");
  const query = input.value.trim();
  if (!query) return;

  appendChatMessage("user", query, `<i class="fa-solid fa-user"></i>`);
  input.value = "";

  setTimeout(() => {
    const response = processStylistAIQuery(query.toLowerCase());
    appendChatMessage("stylist", response.text, `<i class="fa-solid fa-wand-magic-sparkles"></i>`, response.products);
  }, 600);
}

function appendChatMessage(sender, text, iconHtml, matchingProducts = []) {
  const chatMessages = document.getElementById("aiChatMessages");
  if (!chatMessages) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-message ${sender}`;
  
  let bubbleHtml = `<div class="message-bubble">${text}`;
  
  if (matchingProducts.length > 0) {
    bubbleHtml += `<div class="ai-recs-container">`;
    matchingProducts.forEach(p => {
      bubbleHtml += `
        <div class="stylist-recommendation-card">
          <img src="${p.image}" alt="${p.name}">
          <div class="rec-info">
            <h5>${p.name}</h5>
            <span style="white-space: nowrap;">
              ${p.salePrice && p.salePrice < p.price ? `
                ₹${p.salePrice} <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.8rem; font-weight: 500; margin-right: 4px;">₹${p.price}</span> <span style="color: #2ec4b6; font-size: 0.75rem; font-weight: 700; white-space: nowrap;">(${Math.round(((p.price - p.salePrice) / p.price) * 100)}% OFF)</span>
              ` : `₹${p.price}`}
            </span>
          </div>
          <button class="btn btn-primary btn-small" onclick="addToCart('${p._id}')">Buy <i class="fa-solid fa-cart-plus"></i></button>
        </div>`;
    });
    bubbleHtml += `</div>`;
  }
  
  bubbleHtml += `</div>`;

  msgDiv.innerHTML = `
    <div class="avatar">${iconHtml}</div>
    ${bubbleHtml}`;

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function processStylistAIQuery(query) {
  let matchedList = [];
  let responseText = "";

  const wantsKids = query.includes("kid") || query.includes("child") || query.includes("boy") || query.includes("baby") || query.includes("toddler") || query.includes("dungaree");
  const wantsGirls = query.includes("girl") || query.includes("gown") || query.includes("frock") || query.includes("dress") || query.includes("women");
  const wantsMen = query.includes("men") || query.includes("shirt") || query.includes("trousers") || query.includes("chinos") || query.includes("gentleman");

  if (wantsKids) {
    matchedList = products.filter(p => p.category === "children" && p.available);
    responseText = "Certainly! Children require highly cozy clothes. I recommend these ready-made dungarees and cotton co-ords for toddlers. They are highly skin-friendly!";
  } else if (wantsGirls) {
    matchedList = products.filter(p => p.category === "girls" && p.available);
    responseText = "Here are our premium choices for girls. The Enchanted Floral Gown is highly recommended for parties and celebrations, and the modern frock is excellent for hot summers.";
  } else if (wantsMen) {
    matchedList = products.filter(p => p.category === "men" && p.available);
    responseText = "Sure, gentlemen's fashion should be sleek and premium. Check out our Premium Linen Shirts and stretch Cotton Chino trousers. They are extremely popular here in Saran Jalalpur!";
  } else if (query.includes("price") || query.includes("cheap") || query.includes("budget") || query.includes("low")) {
    matchedList = [...products].filter(p => p.available).sort((a,b) => a.price - b.price).slice(0, 2);
    responseText = "On a budget? No problem. Here are some of our best value clothing sets for you, starting as low as ₹499!";
  } else {
    matchedList = products.filter(p => p.available).slice(0, 2);
    responseText = "Welcome! I recommend looking at our new seasonal catalog arrivals below. We have beautiful apparel in small children, girls, and men's collections.";
  }

  return {
    text: responseText,
    products: matchedList
  };
}

// PDF Invoice Downloader utilizing html2pdf.js
function downloadInvoice(orderId) {
  const order = orders.find(o => o.orderId === orderId);
  if (!order) {
    alert("Order not found!");
    return;
  }

  // Create a temporary element to hold the invoice HTML structure
  const element = document.createElement("div");
  element.style.padding = "30px";
  element.style.fontFamily = "'Outfit', sans-serif";
  element.style.color = "#333333";
  element.style.backgroundColor = "#ffffff";

  // Build the invoice layout
  let itemsHtml = order.items.map((item, idx) => `
    <tr style="border-bottom: 1px solid #eeeeee;">
      <td style="padding: 10px 0; font-size: 0.95rem;">${idx + 1}</td>
      <td style="padding: 10px 0; font-size: 0.95rem;">
        <strong>${item.name}</strong>
      </td>
      <td style="padding: 10px 0; text-align: center; font-size: 0.95rem;">${item.qty}</td>
      <td style="padding: 10px 0; text-align: right; font-size: 0.95rem;">₹${item.price}</td>
      <td style="padding: 10px 0; text-align: right; font-size: 0.95rem; font-weight: 600;">₹${item.price * item.qty}</td>
    </tr>
  `).join("");

  element.innerHTML = `
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0070f3; padding-bottom: 20px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 15px;">
        <img src="images/logo.jpg" alt="Logo" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
        <div>
          <h1 style="margin: 0 0 5px 0; color: #0070f3; font-size: 2rem; font-weight: 800; font-family: 'Playfair Display', serif;">Smart Collection</h1>
          <p style="margin: 0; font-size: 0.85rem; color: #666;">Ready Made Hub</p>
          <p style="margin: 3px 0 0 0; font-size: 0.85rem; color: #666;">Near Main Chowk, Jalalpur, Saran, Bihar (841412)</p>
          <p style="margin: 3px 0 0 0; font-size: 0.85rem; color: #666;">Phone: +91 7827782899 | Email: smartcollection.jalalpur@gmail.com</p>
        </div>
      </div>
      <div style="text-align: right;">
        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 1.5rem; font-weight: 700;">RETAIL INVOICE</h2>
        <p style="margin: 0; font-size: 0.9rem;"><strong>Invoice No:</strong> INV-SC-${order.orderId}</p>
        <p style="margin: 3px 0 0 0; font-size: 0.9rem;"><strong>Date:</strong> ${order.date}</p>
        <p style="margin: 3px 0 0 0; font-size: 0.9rem;"><strong>Status:</strong> <span style="padding: 3px 8px; border-radius: 4px; background-color: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 0.8rem;">${order.status}</span></p>
      </div>
    </div>

    <!-- Customer & Delivery Info -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <div>
        <h3 style="margin: 0 0 8px 0; font-size: 0.95rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Customer Details</h3>
        <p style="margin: 0; font-size: 0.95rem; font-weight: 600;">${order.customerName}</p>
        <p style="margin: 4px 0 0 0; font-size: 0.95rem;">Phone: ${order.customerPhone}</p>
      </div>
      <div>
        <h3 style="margin: 0 0 8px 0; font-size: 0.95rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Delivery Method</h3>
        <p style="margin: 0; font-size: 0.95rem; font-weight: 600;">${order.delivery === 'pickup' ? 'Self Pickup at Jalalpur Shop' : 'Local Home Delivery'}</p>
        ${order.delivery === 'delivery' ? `<p style="margin: 4px 0 0 0; font-size: 0.9rem; color: #475569;"><strong>Address:</strong> ${order.address}</p>` : ''}
        ${order.deliveryDate ? `<p style="margin: 4px 0 0 0; font-size: 0.9rem; color: #475569;"><strong>Delivered On:</strong> ${new Date(order.deliveryDate).toLocaleDateString('en-IN')}</p>` : ''}
      </div>
    </div>

    <!-- Order Items Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
      <thead>
        <tr style="border-bottom: 2px solid #cbd5e1; background-color: #f1f5f9;">
          <th style="padding: 10px 0; text-align: left; font-size: 0.9rem; font-weight: 700; width: 40px;">#</th>
          <th style="padding: 10px 0; text-align: left; font-size: 0.9rem; font-weight: 700;">Garment Details</th>
          <th style="padding: 10px 0; text-align: center; font-size: 0.9rem; font-weight: 700; width: 60px;">Qty</th>
          <th style="padding: 10px 0; text-align: right; font-size: 0.9rem; font-weight: 700; width: 100px;">Price</th>
          <th style="padding: 10px 0; text-align: right; font-size: 0.9rem; font-weight: 700; width: 120px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
      <table style="width: 280px; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; font-size: 0.95rem; color: #666;">Subtotal</td>
          <td style="padding: 6px 0; font-size: 0.95rem; text-align: right; font-weight: 500;">₹${order.subtotal}</td>
        </tr>
        ${order.pointsRedeemed ? `
        <tr>
          <td style="padding: 6px 0; font-size: 0.95rem; color: #666;">Loyalty Discount</td>
          <td style="padding: 6px 0; font-size: 0.95rem; text-align: right; font-weight: 500; color: #2ec4b6;">-₹${(order.pointsRedeemed * 0.5).toFixed(2)}</td>
        </tr>
        ` : ''}
        <tr style="border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 6px 0; font-size: 0.95rem; color: #666;">Delivery Fee</td>
          <td style="padding: 6px 0; font-size: 0.95rem; text-align: right; font-weight: 500;">₹${(order.delivery === "delivery" && order.subtotal < 1000) ? '50' : '0 (Free)'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-size: 1.1rem; font-weight: 700; color: #333;">Total Amount</td>
          <td style="padding: 10px 0; font-size: 1.1rem; font-weight: 800; text-align: right; color: #0070f3;">₹${(order.subtotal + ((order.delivery === "delivery" && order.subtotal < 1000) ? 50 : 0) - (order.pointsRedeemed ? order.pointsRedeemed * 0.5 : 0)).toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <!-- Thank you footer -->
    <div style="text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 20px; color: #64748b; font-size: 0.85rem;">
      <p style="margin: 0 0 5px 0; font-weight: 600;">Thank you for shopping at Smart Collection!</p>
      <p style="margin: 0;">This is a computer-generated simulated receipt for ready-made apparel purchases.</p>
    </div>
  `;

  // html2pdf options
  const opt = {
    margin:       10,
    filename:     `invoice_${order.orderId}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // Generate and download
  html2pdf().from(element).set(opt).save();
}

// ==========================================================================
// AI Features: Description Generator & Fashion Recommendations
// ==========================================================================

function createDescriptionFromDetails(name, category, price, sizes) {
  const lowerName = name.toLowerCase();
  
  // Categorize materials and styles
  let material = "premium cotton blend";
  let care = "Machine wash cold with like colors, tumble dry low.";
  let design = "sleek and modern silhouette, perfect for versatile styling";
  
  if (lowerName.includes("linen")) {
    material = "100% natural pure linen fabric";
    care = "Hand wash or dry clean recommended to preserve fabric texture.";
    design = "breathable and ultra-lightweight classic fit, perfect for warm weather comfort";
  } else if (lowerName.includes("silk") || lowerName.includes("gown") || lowerName.includes("frock") || lowerName.includes("dress")) {
    material = "luxurious premium silk-satin blend with a smooth, soft finish";
    care = "Dry clean only to maintain elegant sheen and delicate stitching.";
    design = "exquisite festive design with a flowing silhouette, perfect for weddings, parties, and special occasions";
  } else if (lowerName.includes("denim") || lowerName.includes("jeans") || lowerName.includes("dungaree")) {
    material = "heavy-duty premium stretch denim";
    care = "Machine wash cold inside out, color may bleed slightly on first wash.";
    design = "classic rugged construction with reinforced stitching, tailored for style and maximum durability";
  } else if (lowerName.includes("wool") || lowerName.includes("jacket") || lowerName.includes("sweater")) {
    material = "cozy, high-density insulating wool-acrylic knit";
    care = "Hand wash warm or dry clean, flat dry only.";
    design = "modern snug-fit designed to lock in warmth while maintaining a sharp, trendy style profile";
  } else if (lowerName.includes("cotton") || lowerName.includes("shirt")) {
    material = "100% organic long-staple combed cotton";
    care = "Machine wash warm, iron on medium heat if necessary.";
    design = "tailored breathable smart fit, engineered for all-day comfort and structured look";
  } else if (category === 'children' || lowerName.includes("coord") || lowerName.includes("kids")) {
    material = "ultra-soft, certified skin-friendly organic cotton fabric";
    care = "Gentle cycle machine wash, do not bleach.";
    design = "play-ready flexible seams and tagless construction, ensuring irritation-free comfort for active kids";
  }

  const featuresList = [
    `Crafted from ${material} for exceptional comfort and longevity.`,
    `Features a ${design}.`,
    `Comes in multiple sizes (${sizes || (category === 'children' ? '2-3Y to 5-6Y' : 'S to XL')}) to ensure a perfect tailored fit.`,
    `Care details: ${care}`
  ];

  return `Elevate your wardrobe with the ${name}. ${featuresList.join("\n\n")}`;
}

async function generateAIDescription() {
  const name = document.getElementById("prodName").value.trim();
  const category = document.getElementById("prodCategory").value;
  const price = document.getElementById("prodPrice").value.trim();
  const sizes = document.getElementById("prodSizes").value.trim();

  if (!name) {
    alert("Please enter a Product Name first to help the AI generate a description.");
    return;
  }

  const descTextarea = document.getElementById("prodDesc");
  descTextarea.value = "Generating description with Smart AI...";
  descTextarea.disabled = true;

  setTimeout(() => {
    const generated = createDescriptionFromDetails(name, category, price, sizes);
    descTextarea.value = generated;
    descTextarea.disabled = false;
  }, 800);
}

async function generateAIDescriptionForProduct(productId) {
  const product = products.find(p => p._id === productId);
  if (!product) return;

  const generated = createDescriptionFromDetails(
    product.name,
    product.category,
    product.price,
    product.sizes ? product.sizes.join(', ') : ''
  );

  try {
    await fetchFromApi(`/api/products/${productId}/desc`, {
      method: 'PUT',
      body: JSON.stringify({ desc: generated })
    });
    await loadAllData();
  } catch (err) {
    alert(`AI Description generation failed: ${err.message}`);
  }
}

async function updateProductDesc(productId, descValue) {
  try {
    await fetchFromApi(`/api/products/${productId}/desc`, {
      method: 'PUT',
      body: JSON.stringify({ desc: descValue.trim() })
    });
    await loadAllData();
  } catch (err) {
    alert(`Description update failed: ${err.message}`);
  }
}

function renderAIRecommendations(currentProduct) {
  const recListContainer = document.getElementById("productRecommendationsList");
  if (!recListContainer) return;

  // Filter other active available products
  const otherProducts = products.filter(p => p._id !== currentProduct._id && p.available);

  // Compute recommendation scores
  const scoredProducts = otherProducts.map(p => {
    let score = 0;
    
    // Category match weighting
    if (p.category === currentProduct.category) {
      score += 15;
    }

    // Name token matches
    const pTokens = p.name.toLowerCase().split(/\s+/);
    const currTokens = currentProduct.name.toLowerCase().split(/\s+/);
    const commonTokens = pTokens.filter(tok => currTokens.includes(tok) && tok.length > 3);
    score += commonTokens.length * 8;

    // Price similarity weighting
    const priceDiff = Math.abs(p.price - currentProduct.price);
    const pricePct = priceDiff / currentProduct.price;
    if (pricePct <= 0.15) {
      score += 10;
    } else if (pricePct <= 0.3) {
      score += 5;
    }

    // Convert score to a realistic matching percentage (70% - 98%)
    const matchPercentage = Math.min(99, Math.max(70, Math.floor(70 + (score / 35) * 29)));

    return {
      product: p,
      score,
      matchPercentage
    };
  });

  // Sort descending and select top 4 items
  const topRecs = scoredProducts
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (topRecs.length === 0) {
    recListContainer.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; margin: 0; padding: 10px 0;">No matching recommendations found.</p>`;
    return;
  }

  // Render cards
  recListContainer.innerHTML = topRecs.map(rec => {
    const item = rec.product;
    const isSale = item.salePrice && item.salePrice < item.price;
    const displayPrice = isSale ? `₹${item.salePrice} <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.75rem;">₹${item.price}</span>` : `₹${item.price}`;
    
    return `
      <div class="rec-item-card" onclick="openProductModal('${item._id}')" style="min-width: 140px; max-width: 140px; cursor: pointer; background: var(--bg-accent); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; flex-shrink: 0;">
        <div style="position: relative; height: 110px; width: 100%; overflow: hidden; background-color: var(--bg-body-dark);">
          <img src="${item.image}" alt="${item.name}" style="height: 100%; width: 100%; object-fit: cover;">
          <span style="position: absolute; top: 5px; left: 5px; background: rgba(90, 82, 237, 0.95); color: white; font-size: 0.65rem; font-weight: 700; padding: 2px 5px; border-radius: 50px; display: flex; align-items: center; gap: 2px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
            <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 0.6rem;"></i> ${rec.matchPercentage}% Match
          </span>
        </div>
        <div style="padding: 8px; display: flex; flex-direction: column; gap: 4px; flex-grow: 1;">
          <h5 style="margin: 0; font-size: 0.8rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.name}">${item.name}</h5>
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">${displayPrice}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ==========================================================================
// Customer Authentication, Profile Address, Loyalty & Referrals
// ==========================================================================

function openProfileOrLoginModal() {
  if (currentCustomer) {
    // Open Profile Panel
    document.getElementById("profileName").value = currentCustomer.name || "";
    document.getElementById("profilePhoneDisplay").textContent = currentCustomer.phone ? `Mobile: +91 ${currentCustomer.phone}` : `Email: ${currentCustomer.email}`;
    document.getElementById("profileLoyaltyPoints").textContent = `🪙 ${currentCustomer.loyaltyPoints} Points`;
    const worth = currentCustomer.loyaltyPoints * 0.5;
    const note = currentCustomer.loyaltyPoints >= 200 ? "Discount" : "(Min 200 to redeem)";
    document.getElementById("profileLoyaltyValue").textContent = `Worth ₹${worth.toFixed(2)} ${note}`;
    document.getElementById("profileReferralCodeDisplay").textContent = currentCustomer.referralCode || "SC-XXXXXX";
    document.getElementById("profileReferralsCount").textContent = currentCustomer.referredUsersCount || "0";
    
    renderProfileAddresses();
    document.getElementById("customerProfileModalBackdrop").classList.add("active");
  } else {
    // Open Login Modal and reset inputs
    openAuthModal();
  }
}

function openAuthModal() {
  resetOtpRequest();
  document.getElementById("customerAuthModalBackdrop").classList.add("active");
}

function closeAuthModal() {
  document.getElementById("customerAuthModalBackdrop").classList.remove("active");
}

function closeProfileModal() {
  document.getElementById("customerProfileModalBackdrop").classList.remove("active");
}

function toggleAuthMode(mode) {
  // Deprecated: unified OTP layout replaces separate tabs
}

// --- REAL AUTHENTICATION HANDLERS ---
let currentSimulatedOtp = "";

async function requestOtpCode() {
  const phoneInput = document.getElementById("authPhone");
  if (!phoneInput) return;
  const phone = phoneInput.value.trim();
  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    cleanPhone = cleanPhone.slice(2);
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
    cleanPhone = cleanPhone.slice(1);
  }
  
  if (cleanPhone.length !== 10) {
    alert("Phone number must be exactly 10 digits!");
    return;
  }
  
  try {
    // Check if customer exists first to toggle new profile fields
    let userExists = false;
    try {
      const custCheck = await fetch(`/api/customers/${cleanPhone}`);
      if (custCheck.status === 200) {
        userExists = true;
      }
    } catch (e) {
      // Ignored
    }
    
    // Request OTP from server
    const res = await fetchFromApi("/api/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone: cleanPhone })
    });
    
    if (res.success) {
      currentSimulatedOtp = res.otp;
      
      // Toggle Signup fields
      const signupFields = document.getElementById("newUserFieldsContainer");
      if (signupFields) {
        signupFields.style.display = userExists ? "none" : "block";
      }
      
      // Hide Step 1, Show Step 2
      document.getElementById("otpStep1Container").style.display = "none";
      document.getElementById("otpStep2Container").style.display = "block";
      
      // Trigger sliding mock SMS banner
      showMockSmsBanner(cleanPhone, res.otp);
    }
  } catch (err) {
    alert(`Failed to send OTP: ${err.message}`);
  }
}

async function verifyOtpCode() {
  const phone = document.getElementById("authPhone").value.trim();
  const otp = document.getElementById("authOtp").value.trim();
  const name = document.getElementById("authName").value.trim();
  const referralCode = document.getElementById("authReferralCode").value.trim();
  
  if (!otp || otp.length !== 6) {
    alert("Please enter a valid 6-digit OTP!");
    return;
  }
  
  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    cleanPhone = cleanPhone.slice(2);
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
    cleanPhone = cleanPhone.slice(1);
  }
  
  try {
    const res = await fetchFromApi("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({
        phone: cleanPhone,
        otp,
        name,
        referralCode
      })
    });
    
    if (res.success && res.customer) {
      currentCustomer = res.customer;
      saveCustomerSession(currentCustomer);
      
      // Clean up mock SMS banner
      const banner = document.getElementById("mockSmsBanner");
      if (banner) banner.remove();
      
      alert(`🎉 Verification successful! Welcome, ${currentCustomer.name}!`);
      closeAuthModal();
      syncCustomerUI();
      checkAdminAuthState();
      
      localStorage.removeItem("smart_collection_ref_code");
      await loadAllData();
    }
  } catch (err) {
    alert(`Verification Failed: ${err.message}`);
  }
}

function resetOtpRequest() {
  document.getElementById("authPhone").value = "";
  document.getElementById("authOtp").value = "";
  document.getElementById("authName").value = "";
  document.getElementById("authReferralCode").value = "";
  
  document.getElementById("otpStep1Container").style.display = "block";
  document.getElementById("otpStep2Container").style.display = "none";
  document.getElementById("newUserFieldsContainer").style.display = "none";
}

function showMockSmsBanner(phone, otp) {
  const oldBanner = document.getElementById("mockSmsBanner");
  if (oldBanner) oldBanner.remove();
  
  const banner = document.createElement("div");
  banner.id = "mockSmsBanner";
  banner.style.cssText = `
    position: fixed;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 380px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(90, 82, 237, 0.4);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    color: white;
    padding: 12px 16px;
    border-radius: 12px;
    z-index: 10000;
    transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    font-family: system-ui, -apple-system, sans-serif;
    backdrop-filter: blur(10px);
  `;
  
  banner.innerHTML = `
    <div style="display: flex; gap: 10px; align-items: flex-start;">
      <div style="background: var(--primary); padding: 6px; border-radius: 8px; color: white;">
        <i class="fa-solid fa-comment-sms" style="font-size: 1.1rem;"></i>
      </div>
      <div style="flex: 1; font-size: 0.85rem;">
        <strong style="display: block; color: #ff9f43; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Messages • Now</strong>
        <span style="font-weight: 700; color: #e2e8f0; display: block; margin-top: 2px;">Smart Collection OTP</span>
        <span style="color: #94a3b8; display: block; margin-top: 2px; line-height: 1.3;">Use code <strong style="color: white; font-size: 0.95rem; background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.25);">${otp}</strong> to verify your account on Smart Collection.</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(banner);
  
  setTimeout(() => {
    banner.style.top = "20px";
  }, 100);
  
  setTimeout(() => {
    banner.style.top = "-100px";
    setTimeout(() => banner.remove(), 600);
  }, 7000);
}

async function initializeGoogleSignIn() {
  if (typeof google === 'undefined') {
    setTimeout(initializeGoogleSignIn, 500);
    return;
  }
  
  let clientId = "1039845700248-sandbox.apps.googleusercontent.com";
  try {
    const res = await fetch('/api/config/google-client-id');
    const data = await res.json();
    if (data.clientId) {
      clientId = data.clientId;
    }
  } catch (err) {
    console.warn("Failed to fetch Google Client ID from backend, using default:", err.message);
  }
  
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredentialResponse
  });
  
  const container = document.getElementById("googleBtnContainer");
  if (container) {
    const availableWidth = Math.min(420, window.innerWidth * 0.9) - 40;
    const btnWidth = Math.max(200, Math.min(340, Math.floor(availableWidth))).toString();
    google.accounts.id.renderButton(
      container,
      { theme: "outline", size: "large", width: btnWidth }
    );
  }
}

async function handleGoogleCredentialResponse(response) {
  try {
    const res = await fetchFromApi("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: response.credential })
    });
    
    if (res.success && res.customer) {
      currentCustomer = res.customer;
      saveCustomerSession(currentCustomer);
      
      alert(`🎉 Signed in via Google as ${currentCustomer.name}!`);
      closeAuthModal();
      syncCustomerUI();
      checkAdminAuthState();
      
      await loadAllData();
    }
  } catch (err) {
    alert(`Google Authentication Failed: ${err.message}`);
  }
}

async function handleCustomerLogout() {
  if (confirm("Are you sure you want to log out?")) {
    currentCustomer = null;
    localStorage.removeItem("currentCustomer");
    sessionStorage.removeItem("smart_collection_admin_logged");
    redeemLoyaltyChecked = false;
    
    const redeemCheckbox = document.getElementById("chkRedeemLoyalty");
    if (redeemCheckbox) redeemCheckbox.checked = false;

    closeProfileModal();
    syncCustomerUI();
    checkAdminAuthState();
    updateCartUI();
    await loadAllData();
    alert("You have logged out successfully.");
  }
}

async function saveProfileName() {
  const name = document.getElementById("profileName").value.trim();
  if (!name) {
    alert("Please enter a profile name!");
    return;
  }

  try {
    const updated = await fetchFromApi(`/api/customers/${currentCustomer.phone || currentCustomer._id}/profile`, {
      method: "PUT",
      body: JSON.stringify({ name })
    });
    
    if (updated) {
      currentCustomer = updated;
      saveCustomerSession(currentCustomer);
      syncCustomerUI();
      alert("Profile name updated successfully!");
    }
  } catch (err) {
    alert(`Failed to update profile name: ${err.message}`);
  }
}

function renderProfileAddresses() {
  const listContainer = document.getElementById("profileAddressesList");
  if (!listContainer) return;

  if (!currentCustomer.addresses || currentCustomer.addresses.length === 0) {
    listContainer.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; margin: 0;">No shipping addresses saved yet.</p>`;
    return;
  }

  listContainer.innerHTML = currentCustomer.addresses.map(addr => `
    <div class="address-item-card">
      <div class="address-item-card-content">
        <strong>${addr.label}</strong>
        <p>${addr.addressLine}</p>
      </div>
      <button class="btn btn-secondary btn-small" onclick="deleteSavedAddress('${addr._id}')" style="padding: 4px 8px; color: #e71d36; border-color: transparent;">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `).join("");
}

async function addSavedAddress() {
  const labelInput = document.getElementById("newAddressLabel");
  const textInput = document.getElementById("newAddressText");

  const label = labelInput.value.trim() || "Home";
  const addressLine = textInput.value.trim();

  if (!addressLine) {
    alert("Please enter the shipping address line!");
    return;
  }

  try {
    const updated = await fetchFromApi(`/api/customers/${currentCustomer.phone || currentCustomer._id}/addresses`, {
      method: "POST",
      body: JSON.stringify({ label, addressLine })
    });

    if (updated) {
      currentCustomer = updated;
      saveCustomerSession(currentCustomer);
      
      labelInput.value = "";
      textInput.value = "";
      renderProfileAddresses();
      syncCustomerUI();
      alert("New shipping address added successfully!");
    }
  } catch (err) {
    alert(`Failed to add address: ${err.message}`);
  }
}

async function deleteSavedAddress(addressId) {
  if (confirm("Delete this saved address?")) {
    try {
      const updated = await fetchFromApi(`/api/customers/${currentCustomer.phone || currentCustomer._id}/addresses/${addressId}`, {
        method: "DELETE"
      });

      if (updated) {
        currentCustomer = updated;
        saveCustomerSession(currentCustomer);
        renderProfileAddresses();
        syncCustomerUI();
      }
    } catch (err) {
      alert(`Failed to delete address: ${err.message}`);
    }
  }
}

function syncCustomerUI() {
  const headerTriggerText = document.getElementById("profileTriggerText");
  const chkName = document.getElementById("chkName");
  const chkPhone = document.getElementById("chkPhone");
  const savedAddrContainer = document.getElementById("savedAddressesContainer");
  const chkSavedAddress = document.getElementById("chkSavedAddress");
  
  const navAdmin = document.getElementById("nav-admin");
  const mobNavAdmin = document.getElementById("mob-nav-admin");
  const isAdmin = (sessionStorage.getItem("smart_collection_admin_logged") === "true") || (currentCustomer && currentCustomer.role === "admin");

  // Dynamically show/hide Admin link in navbar and mobile menu drawer
  if (navAdmin) navAdmin.style.display = isAdmin ? "flex" : "none";
  if (mobNavAdmin) mobNavAdmin.style.display = isAdmin ? "flex" : "none";

  if (currentCustomer) {
    // Authenticated state
    if (headerTriggerText) {
      headerTriggerText.textContent = currentCustomer.name ? currentCustomer.name.split(" ")[0] : "Profile";
    }

    if (chkName) chkName.value = currentCustomer.name || "";
    if (chkPhone) {
      chkPhone.value = currentCustomer.phone || "";
      chkPhone.readOnly = false; // Always allow editing the checkout contact number
    }

    // Populate checkout shipping address dropdown
    if (savedAddrContainer && chkSavedAddress) {
      if (currentCustomer.addresses && currentCustomer.addresses.length > 0) {
        savedAddrContainer.style.display = "block";
        chkSavedAddress.innerHTML = `
          <option value="">-- Choose saved address or write new --</option>
          ${currentCustomer.addresses.map(addr => `
            <option value="${addr.addressLine}">${addr.label}: ${addr.addressLine}</option>
          `).join("")}
        `;
      } else {
        savedAddrContainer.style.display = "none";
      }
    }
  } else {
    // Logged-out state
    if (headerTriggerText) {
      headerTriggerText.textContent = "Login";
    }

    if (chkName) chkName.value = "";
    if (chkPhone) {
      chkPhone.value = "";
      chkPhone.readOnly = false;
    }

    if (savedAddrContainer) {
      savedAddrContainer.style.display = "none";
    }
  }
}

function useSavedAddress(val) {
  const chkAddressTextarea = document.getElementById("chkAddress");
  if (chkAddressTextarea && val) {
    chkAddressTextarea.value = val;
  }
}

function toggleLoyaltyRedemption() {
  updateCartUI();
}

function copyReferralLink() {
  if (!currentCustomer) return;
  const link = `${window.location.origin}${window.location.pathname}?ref=${currentCustomer.referralCode}`;
  
  navigator.clipboard.writeText(link).then(() => {
    alert(`📋 Referral link copied to clipboard!\nShare this with friends: ${link}`);
  }).catch(() => {
    alert(`Failed to copy link. Code is: ${currentCustomer.referralCode}`);
  });
}

// Track referral url param on script load
(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get("ref");
  if (refCode) {
    localStorage.setItem("smart_collection_ref_code", refCode);
    console.log(`[REFERRAL TRACK] Tracked referral code: ${refCode}`);
  }
})();

// ==========================================================================
// Customer Wishlist & Recommendations Handlers (MongoDB Sync)
// ==========================================================================

async function toggleWishlist(productId) {
  if (!currentCustomer) {
    alert("Please login to add items to your wishlist.");
    openProfileOrLoginModal();
    return;
  }

  const isWishlisted = currentCustomer.wishlist && currentCustomer.wishlist.some(item => {
    const id = item._id || item;
    return id.toString() === productId.toString();
  });

  try {
    let response;
    if (isWishlisted) {
      response = await fetchFromApi(`/api/customers/${currentCustomer.phone || currentCustomer._id}/wishlist/${productId}`, {
        method: 'DELETE'
      });
    } else {
      response = await fetchFromApi(`/api/customers/${currentCustomer.phone || currentCustomer._id}/wishlist`, {
        method: 'POST',
        body: JSON.stringify({ productId })
      });
    }

    if (response) {
      currentCustomer = response;
      saveCustomerSession(currentCustomer);
      
      syncCustomerUI();
      renderFeaturedProducts();
      applyFilters();
      renderFlashSaleProducts();
      
      const activeTabLink = document.querySelector(".nav-link.active");
      if (activeTabLink && activeTabLink.id === "nav-wishlist") {
        renderWishlistTab();
      }
    }
  } catch (err) {
    alert(`Failed to update wishlist: ${err.message}`);
  }
}

function renderWishlistTab() {
  const emptyMessage = document.getElementById("wishlistEmptyMessage");
  const emptyTitle = document.getElementById("wishlistEmptyTitle");
  const emptyText = document.getElementById("wishlistEmptyText");
  const emptyBtn = document.getElementById("wishlistEmptyBtn");
  
  const wishlistContainer = document.getElementById("wishlistItemsContainer");
  const wishlistGrid = document.getElementById("wishlistProductGrid");
  
  const recSection = document.getElementById("wishlistRecommendationsSection");
  const recGrid = document.getElementById("wishlistRecommendationsGrid");

  if (!emptyMessage || !wishlistContainer || !wishlistGrid || !recSection || !recGrid) return;

  if (!currentCustomer) {
    emptyTitle.textContent = "Please Login to View Wishlist";
    emptyText.textContent = "Login with your phone number to save your favorite garments and view personalized recommendations.";
    emptyBtn.textContent = "Login / Sign Up";
    emptyBtn.onclick = () => openProfileOrLoginModal();
    
    emptyMessage.style.display = "block";
    wishlistContainer.style.display = "none";
    recSection.style.display = "none";
    return;
  }

  const wishlist = currentCustomer.wishlist || [];
  if (wishlist.length === 0) {
    emptyTitle.textContent = "Your Wishlist is Empty";
    emptyText.textContent = "Save your favorite ready-made garments by clicking the heart icon on products.";
    emptyBtn.textContent = "Explore Shop";
    emptyBtn.onclick = () => showTab('shop');
    
    emptyMessage.style.display = "block";
    wishlistContainer.style.display = "none";
    recSection.style.display = "none";
    return;
  }

  emptyMessage.style.display = "none";
  wishlistContainer.style.display = "block";
  wishlistGrid.innerHTML = wishlist.map(item => generateProductCardMarkup(item)).join("");

  // Recommendation engine based on wishlisted item categories
  const wishlistCategories = wishlist.map(item => item.category).filter(Boolean);
  const recommendedProducts = [];

  products.forEach(p => {
    // Exclude if already in wishlist
    const inWishlist = wishlist.some(item => (item._id || item).toString() === p._id.toString());
    if (inWishlist) return;

    // Exclude if already in cart
    const inCart = cart.some(item => (item.productId || item.id).toString() === p._id.toString());
    if (inCart) return;

    // Exclude if out of stock
    if (!p.available || p.stock <= 0) return;

    // Must be in one of the categories of wishlisted products
    if (wishlistCategories.includes(p.category)) {
      const matchCount = wishlistCategories.filter(c => c === p.category).length;
      // Boost match score if user has multiple items in this category
      const matchScore = Math.min(98, 88 + (matchCount * 2));
      recommendedProducts.push({
        ...p,
        matchPercent: matchScore
      });
    }
  });

  if (recommendedProducts.length > 0) {
    recSection.style.display = "block";
    recGrid.innerHTML = recommendedProducts.map(p => generateProductCardMarkup(p)).join("");
  } else {
    recSection.style.display = "none";
    recGrid.innerHTML = "";
  }
}

// --- SIZE ADVISOR CALCULATOR ---
function toggleSizeAdvisor() {
  const container = document.getElementById("sizeAdvisorContainer");
  if (!container) return;
  
  const isHidden = container.style.display === "none";
  container.style.display = isHidden ? "block" : "none";
  
  // Clear inputs and results on toggle
  const ageInput = document.getElementById("advisorAge");
  const heightInput = document.getElementById("advisorHeight");
  const weightInput = document.getElementById("advisorWeight");
  const resultDiv = document.getElementById("advisorResult");
  
  if (ageInput) ageInput.value = "";
  if (heightInput) heightInput.value = "";
  if (weightInput) weightInput.value = "";
  if (resultDiv) {
    resultDiv.style.display = "none";
    resultDiv.innerHTML = "";
  }
}

function calculateRecommendedSize() {
  if (!currentModalProduct) return;
  
  const ageVal = parseFloat(document.getElementById("advisorAge").value);
  const heightVal = parseFloat(document.getElementById("advisorHeight").value);
  const weightVal = parseFloat(document.getElementById("advisorWeight").value);
  
  const resultDiv = document.getElementById("advisorResult");
  if (!resultDiv) return;
  
  const category = currentModalProduct.category;
  let recommendedSize = "";
  let warningMessage = "";
  
  if (category === "children") {
    if (isNaN(ageVal) || ageVal <= 0) {
      showAdvisorError("Please enter a valid age in years.");
      return;
    }
    if (ageVal < 3.5) {
      recommendedSize = "2-3Y";
    } else if (ageVal <= 5.5) {
      recommendedSize = "4-5Y";
    } else {
      recommendedSize = "5-6Y";
    }

    // Out-of-bounds check (adult attributes entered for children products)
    if (ageVal > 10 || heightVal > 140 || weightVal > 35) {
      warningMessage = "This is a children's item. The details entered suggest an adult or older child; the largest size (5-6Y) will be too small.";
    }
  } else if (category === "girls") {
    if (isNaN(weightVal) || weightVal <= 0) {
      showAdvisorError("Please enter a valid weight in kg.");
      return;
    }
    if (weightVal < 45) {
      recommendedSize = "S";
    } else if (weightVal < 55) {
      recommendedSize = "M";
    } else if (weightVal < 65) {
      recommendedSize = "L";
    } else {
      recommendedSize = "XL";
    }

    // Out-of-bounds check (very young child details entered for adult products)
    if ((ageVal > 0 && ageVal < 10) || weightVal < 30 || (heightVal > 0 && heightVal < 130)) {
      warningMessage = "This is an adult/teen girls' item. The details entered suggest a young child; the smallest size (S) may be too large.";
    }
  } else {
    // Men (or any fallback category)
    if (isNaN(weightVal) || weightVal <= 0) {
      showAdvisorError("Please enter a valid weight in kg.");
      return;
    }
    if (weightVal < 60) {
      recommendedSize = "S";
    } else if (weightVal < 70) {
      recommendedSize = "M";
    } else if (weightVal < 80) {
      recommendedSize = "L";
    } else if (weightVal < 90) {
      recommendedSize = "XL";
    } else {
      recommendedSize = "XXL";
    }
    
    // Height adjustment logic
    if (!isNaN(heightVal) && heightVal > 0) {
      const menSizes = ["S", "M", "L", "XL", "XXL"];
      let sizeIdx = menSizes.indexOf(recommendedSize);
      if (heightVal > 185 && sizeIdx < menSizes.length - 1) {
        sizeIdx++;
        recommendedSize = menSizes[sizeIdx];
      } else if (heightVal < 165 && sizeIdx > 0) {
        sizeIdx--;
        recommendedSize = menSizes[sizeIdx];
      }
    }

    // Out-of-bounds check (very young child details entered for adult products)
    if ((ageVal > 0 && ageVal < 10) || weightVal < 30 || (heightVal > 0 && heightVal < 130)) {
      warningMessage = "This is an adult men's item. The details entered suggest a young child; the smallest size (S) may be too large.";
    }
  }
  
  // Constraint Protection: check if available in live product sizes
  const availableSizes = (currentModalProduct.sizes && currentModalProduct.sizes.length > 0) ? currentModalProduct.sizes : 
                         (category === 'children' ? ['2-3Y', '4-5Y', '5-6Y'] : 
                          category === 'girls' ? ['S', 'M', 'L', 'XL'] : 
                          ['S', 'M', 'L', 'XL', 'XXL']);
                          
  if (!availableSizes.includes(recommendedSize)) {
    recommendedSize = findClosestSize(recommendedSize, availableSizes, category);
  }
  
  // Auto-click corresponding size button
  const sizesContainer = document.getElementById("productModalSizes");
  if (sizesContainer) {
    const btns = Array.from(sizesContainer.querySelectorAll(".size-select-btn"));
    const targetBtn = btns.find(btn => btn.textContent.trim() === recommendedSize);
    if (targetBtn) {
      selectModalSize(recommendedSize, targetBtn);
    }
  }
  
  // Display successful result
  resultDiv.style.display = "block";
  if (warningMessage) {
    resultDiv.style.color = "#ff9f43";
    resultDiv.style.background = "rgba(255, 159, 67, 0.08)";
    resultDiv.style.borderColor = "rgba(255, 159, 67, 0.15)";
    resultDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Recommended Size: <strong>${recommendedSize}</strong><br><span style="font-size: 0.72rem; font-weight: 500; display: block; margin-top: 4px; line-height: 1.3;">${warningMessage}</span>`;
  } else {
    resultDiv.style.color = "#2ec4b6";
    resultDiv.style.background = "rgba(46,196,182,0.08)";
    resultDiv.style.borderColor = "rgba(46,196,182,0.15)";
    resultDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> Recommended Size: <strong>${recommendedSize}</strong> (Best Fit)`;
  }
}

function showAdvisorError(message) {
  const resultDiv = document.getElementById("advisorResult");
  if (!resultDiv) return;
  resultDiv.style.display = "block";
  resultDiv.style.color = "#e71d36";
  resultDiv.style.background = "rgba(231,29,54,0.08)";
  resultDiv.style.borderColor = "rgba(231,29,54,0.15)";
  resultDiv.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${message}`;
}

function findClosestSize(recommended, available, category) {
  if (available.length === 0) return recommended;
  
  let sizeMap = {};
  if (category === "children") {
    sizeMap = {
      "2-3Y": 1,
      "4-5Y": 2,
      "5-6Y": 3
    };
  } else {
    sizeMap = {
      "XS": 1,
      "S": 2,
      "M": 3,
      "L": 4,
      "XL": 5,
      "XXL": 6,
      "XXXL": 7
    };
  }
  
  const recommendedVal = sizeMap[recommended] || 3;
  let closest = available[0];
  let minDiff = Infinity;
  
  for (const av of available) {
    const val = sizeMap[av] || 3;
    const diff = Math.abs(val - recommendedVal);
    if (diff < minDiff) {
      minDiff = diff;
      closest = av;
    }
  }
  return closest;
}

// ==========================================================================
// Advanced Search Auto-complete, Typo Correction, and Recent Searches
// ==========================================================================

const POPULAR_SEARCH_TERMS = [
  "kid dress",
  "pink gown",
  "cotton shirt",
  "summer frock",
  "linen shirt",
  "casual chinos"
];

function initSearchSuggestions() {
  const searchInput = document.getElementById("shopSearchInput");
  const suggestionsDropdown = document.getElementById("searchSuggestionsDropdown");
  if (!searchInput || !suggestionsDropdown) return;

  // Render on focus/click
  searchInput.addEventListener("focus", showSuggestions);
  searchInput.addEventListener("click", showSuggestions);

  // Render on input typing
  searchInput.addEventListener("input", () => {
    renderSearchSuggestions();
  });

  // Handle enter key to save recent search
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim();
      if (query) {
        saveRecentSearch(query);
      }
      suggestionsDropdown.style.display = "none";
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !suggestionsDropdown.contains(e.target)) {
      suggestionsDropdown.style.display = "none";
    }
  });
}

function showSuggestions() {
  const suggestionsDropdown = document.getElementById("searchSuggestionsDropdown");
  if (suggestionsDropdown) {
    suggestionsDropdown.style.display = "flex";
    renderSearchSuggestions();
  }
}

function getRecentSearches() {
  return JSON.parse(localStorage.getItem("smart_collection_recent_searches")) || [];
}

function saveRecentSearch(query) {
  let recents = getRecentSearches();
  const cleanQ = query.toLowerCase().trim();
  if (!cleanQ) return;
  
  recents = recents.filter(item => item !== cleanQ);
  recents.unshift(cleanQ);
  
  if (recents.length > 5) {
    recents.pop();
  }
  localStorage.setItem("smart_collection_recent_searches", JSON.stringify(recents));
}

function removeRecentSearch(query) {
  let recents = getRecentSearches();
  recents = recents.filter(item => item !== query);
  localStorage.setItem("smart_collection_recent_searches", JSON.stringify(recents));
  renderSearchSuggestions();
}

function clearRecentSearches() {
  localStorage.removeItem("smart_collection_recent_searches");
  renderSearchSuggestions();
}

function selectSearchSuggestion(val) {
  const searchInput = document.getElementById("shopSearchInput");
  if (searchInput) {
    searchInput.value = val;
    saveRecentSearch(val);
    applyFilters();
  }
  const dropdown = document.getElementById("searchSuggestionsDropdown");
  if (dropdown) dropdown.style.display = "none";
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return dp[m][n];
}

function matchProductSearch(p, query) {
  const name = p.name.toLowerCase();
  const desc = p.desc.toLowerCase();
  const cat = p.category.toLowerCase();
  
  if (name.includes(query) || desc.includes(query) || cat.includes(query)) return true;
  
  const tokens = query.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return true;
  
  let allTokensMatch = true;
  for (const token of tokens) {
    let tokenMatches = name.includes(token) || desc.includes(token) || cat.includes(token);
    
    if (!tokenMatches) {
      if (token === "kid" || token === "kids" || token === "toddler" || token === "toddlers") {
        tokenMatches = (cat === "children");
      } else if (token === "dress" || token === "dresses") {
        tokenMatches = name.includes("frock") || name.includes("gown") || name.includes("dungaree") || name.includes("co-ord") || cat === "children" || cat === "girls";
      } else if (token === "pink") {
        tokenMatches = name.includes("gown");
      } else if (token === "gown" || token === "gowns") {
        tokenMatches = name.includes("gown");
      } else if (token === "cotton") {
        tokenMatches = name.includes("dungaree") || name.includes("co-ord") || name.includes("frock") || name.includes("chinos") || desc.includes("cotton");
      } else if (token === "shirt" || token === "shirts") {
        tokenMatches = name.includes("shirt");
      }
    }
    
    if (!tokenMatches) {
      allTokensMatch = false;
      break;
    }
  }
  
  return allTokensMatch;
}

function renderSearchSuggestions() {
  const dropdown = document.getElementById("searchSuggestionsDropdown");
  const searchInput = document.getElementById("shopSearchInput");
  if (!dropdown || !searchInput) return;

  const query = searchInput.value.toLowerCase().trim();
  let html = "";

  if (!query) {
    const recents = getRecentSearches();
    if (recents.length > 0) {
      html += `
        <div class="suggestions-section">
          <div class="suggestions-section-title">
            <span>Recent Searches</span>
            <button class="suggestions-clear-btn" onclick="event.stopPropagation(); clearRecentSearches()">Clear All</button>
          </div>
          ${recents.map(item => `
            <div class="suggestion-item" onclick="selectSearchSuggestion('${item}')">
              <div class="suggestion-item-left">
                <i class="fa-regular fa-clock"></i>
                <span class="suggestion-item-text">${item}</span>
              </div>
              <button class="suggestion-item-delete" onclick="event.stopPropagation(); removeRecentSearch('${item}')">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          `).join("")}
        </div>
      `;
    }

    html += `
      <div class="suggestions-section">
        <div class="suggestions-section-title">Popular Searches</div>
        ${POPULAR_SEARCH_TERMS.map(item => `
          <div class="suggestion-item" onclick="selectSearchSuggestion('${item}')">
            <div class="suggestion-item-left">
              <i class="fa-solid fa-fire" style="color: #ff9f43;"></i>
              <span class="suggestion-item-text">${item}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    dropdown.innerHTML = html;
    return;
  }

  const matchingTerms = POPULAR_SEARCH_TERMS.filter(term => term.includes(query));
  const matchingProducts = products.filter(p => p.available && (p.name.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query)));

  let autocompleteHtml = "";

  if (matchingTerms.length > 0) {
    autocompleteHtml += `
      <div class="suggestions-section">
        <div class="suggestions-section-title">Matching Searches</div>
        ${matchingTerms.map(term => {
          const highlighted = term.replace(new RegExp(`(${query})`, 'gi'), "<strong>$1</strong>");
          return `
            <div class="suggestion-item" onclick="selectSearchSuggestion('${term}')">
              <div class="suggestion-item-left">
                <i class="fa-solid fa-magnifying-glass"></i>
                <span class="suggestion-item-text">${highlighted}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  if (matchingProducts.length > 0) {
    autocompleteHtml += `
      <div class="suggestions-section">
        <div class="suggestions-section-title">Garment Matches</div>
        ${matchingProducts.slice(0, 3).map(p => {
          const highlighted = p.name.replace(new RegExp(`(${query})`, 'gi'), "<strong>$1</strong>");
          return `
            <div class="suggestion-item" onclick="selectSearchSuggestion('${p.name}')">
              <div class="suggestion-item-left">
                <i class="fa-solid fa-shirt"></i>
                <span class="suggestion-item-text">${highlighted} <span style="font-size: 0.75rem; color: var(--text-muted);">(${p.category})</span></span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  let typoHtml = "";
  const directMatches = products.filter(p => p.available && matchProductSearch(p, query));
  
  if (directMatches.length === 0) {
    let bestMatch = "";
    let minDistance = 999;
    
    POPULAR_SEARCH_TERMS.forEach(term => {
      const dist = levenshteinDistance(query, term);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = term;
      }
    });

    products.forEach(p => {
      if (!p.available) return;
      const words = p.name.toLowerCase().split(/\s+/);
      words.forEach(word => {
        const cleanWord = word.replace(/[^a-z0-9]/g, "");
        if (cleanWord.length > 3) {
          const dist = levenshteinDistance(query, cleanWord);
          if (dist < minDistance) {
            minDistance = dist;
            bestMatch = p.name;
          }
        }
      });
    });

    if (minDistance <= 4 && bestMatch !== query) {
      typoHtml = `
        <div class="typo-suggestion-box">
          <i class="fa-solid fa-circle-info" style="color: var(--primary); margin-right: 6px;"></i>
          No results for "${query}". Did you mean <span class="typo-suggestion-link" onclick="selectSearchSuggestion('${bestMatch}')">${bestMatch}</span>?
        </div>
      `;
    }
  }

  if (!autocompleteHtml && !typoHtml) {
    dropdown.innerHTML = `
      <div style="padding: 16px; font-size: 0.82rem; color: var(--text-muted); text-align: center;">
        No suggestions found for "${query}"
      </div>
    `;
  } else {
    dropdown.innerHTML = typoHtml + autocompleteHtml;
  }
}

function toggleFaq(card) {
  const answer = card.querySelector(".faq-answer");
  const icon = card.querySelector("i");
  const allAnswers = document.querySelectorAll(".faq-answer");
  const allIcons = document.querySelectorAll(".faq-card i");
  
  // Close all other FAQs
  allAnswers.forEach(ans => {
    if (ans !== answer) ans.style.maxHeight = null;
  });
  allIcons.forEach(ic => {
    if (ic !== icon) ic.style.transform = "rotate(0deg)";
  });

  // Toggle current FAQ
  if (answer.style.maxHeight) {
    answer.style.maxHeight = null;
    icon.style.transform = "rotate(0deg)";
  } else {
    answer.style.maxHeight = answer.scrollHeight + "px";
    icon.style.transform = "rotate(180deg)";
  }
}

function handleContactSubmit(event) {
  event.preventDefault();
  const name = document.getElementById("contactName").value.trim();
  const phone = document.getElementById("contactPhone").value.trim();
  const email = document.getElementById("contactEmail").value.trim();
  const message = document.getElementById("contactMessage").value.trim();
  
  alert(`Thank you, ${name}! Your query has been logged. Our customer support team will contact you on +91 ${phone} shortly.`);
  document.getElementById("contactForm").reset();
}

function renderFlashSaleProducts() {
  const grid = document.getElementById("flashSaleProductGrid");
  if (!grid) return;
  
  // Filter products that have salePrice (or take a few default ones and mock salePrice)
  let saleItems = products.filter(p => p.salePrice && p.available);
  
  // If not enough products, let's mock 2 more as flash sales
  if (saleItems.length < 3) {
    const extra = products.filter(p => !p.salePrice && p.available).slice(0, 3 - saleItems.length);
    extra.forEach(p => {
      p.salePrice = Math.round(p.price * 0.8); // 20% off mock
    });
    saleItems = [...saleItems, ...extra];
  }
  
  grid.innerHTML = saleItems.map(p => {
    const dbId = p._id;
    const discountPercent = Math.round(((p.price - p.salePrice) / p.price) * 100);
    const progressPercent = Math.min(100, Math.max(10, (p.stock / 20) * 100));
    
    const isWishlisted = currentCustomer && currentCustomer.wishlist && currentCustomer.wishlist.some(item => {
      const id = item._id || item;
      return id.toString() === dbId.toString();
    });

    return `
      <div class="product-card" id="flash-prod-${dbId}">
        <div class="product-img-wrapper">
          <span class="product-tag badge" style="background: #e71d36; color: white; font-weight: 800; font-size: 0.7rem; border-radius: 4px; padding: 3px 8px; z-index: 5;">⚡ FLASH SALE -${discountPercent}%</span>
          <button class="wishlist-heart-btn ${isWishlisted ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${dbId}')" title="${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}">
            <i class="${isWishlisted ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
          </button>
          <div class="product-images-stack" style="cursor: pointer;" onclick="openProductModal('${dbId}')">
            <img class="card-main-img active" src="${p.image}" alt="${p.name}">
          </div>
        </div>
        <div class="product-info">
          <div class="product-meta">
            <span>Smart Collection</span>
            <span class="stock-status status-low-stock">Only ${p.stock} left!</span>
          </div>
          <h4 class="product-title" onclick="openProductModal('${dbId}')" style="cursor: pointer;">${p.name}</h4>
          
          <div style="display: flex; align-items: center; gap: 8px; margin: 8px 0;">
            <span class="product-price" style="color: #e71d36; font-size: 1.25rem;">₹${p.salePrice}</span>
            <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.9rem;">₹${p.price}</span>
          </div>
          
          <!-- Stock progress bar -->
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">
              <span>Hurry, only ${p.stock} left!</span>
              <span>${Math.round(progressPercent)}% sold</span>
            </div>
            <div style="height: 6px; background: var(--border); border-radius: 10px; overflow: hidden; width: 100%;">
              <div style="width: ${progressPercent}%; background: linear-gradient(90deg, #e71d36, #f59f00); height: 100%; border-radius: 10px;"></div>
            </div>
          </div>

          <div class="product-actions" style="margin-top: 10px;">
            <button class="btn btn-primary" onclick="addToCart('${dbId}')" style="width: 100%; padding: 8px 10px; font-size: 0.8rem; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <i class="fa-solid fa-cart-plus"></i> Add To Cart
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function initFlashSaleTimer() {
  if (flashSaleInterval) {
    clearInterval(flashSaleInterval);
    flashSaleInterval = null;
  }

  const container = document.getElementById("flashSaleContainer");
  const timerSpan = document.getElementById("flashSaleTimer");
  if (!timerSpan) return;

  const settings = flashSaleSettings;
  if (!settings || !settings.isActive || !settings.startDate || !settings.endDate) {
    if (container) container.style.display = "none";
    return;
  }

  const start = new Date(settings.startDate).getTime();
  const end = new Date(settings.endDate).getTime();
  const now = Date.now();

  // If already expired, hide container and return early without starting interval or reloading
  if (now > end) {
    if (container) container.style.display = "none";
    return;
  }

  const updateTimer = () => {
    const currentNow = Date.now();

    if (currentNow < start) {
      if (container) container.style.display = "none";
      return;
    }

    if (currentNow >= start && currentNow <= end) {
      if (container) container.style.display = "block";
      const diff = end - currentNow;
      const hours = Math.floor(diff / (60 * 60 * 1000));
      const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      const secs = Math.floor((diff % (60 * 1000)) / 1000);
      
      timerSpan.textContent = `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
      return;
    }

    if (currentNow > end) {
      clearInterval(flashSaleInterval);
      flashSaleInterval = null;
      if (container) container.style.display = "none";
      console.log("Flash Sale campaign expired!");
      // Automatically trigger reload to revert storefront prices
      loadAllData();
    }
  };

  updateTimer();
  flashSaleInterval = setInterval(updateTimer, 1000);
}

// Convert date to datetime-local input string format
function toDatetimeLocalString(date) {
  if (!date) return "";
  const d = new Date(date);
  const tzOffset = d.getTimezoneOffset() * 60000; // offset in milliseconds
  return (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
}

async function loadFlashSaleSettings() {
  try {
    const settings = await fetchFromApi("/api/flash-sale/settings");
    flashSaleSettings = settings;
    
    const activeToggle = document.getElementById("flashSaleActiveToggle");
    const startInput = document.getElementById("flashSaleStartInput");
    const endInput = document.getElementById("flashSaleEndInput");
    
    if (activeToggle) activeToggle.checked = !!settings.isActive;
    if (startInput && settings.startDate) startInput.value = toDatetimeLocalString(settings.startDate);
    if (endInput && settings.endDate) endInput.value = toDatetimeLocalString(settings.endDate);
  } catch (err) {
    console.error("Failed to load flash sale settings in admin:", err);
  }
}

async function handleFlashSaleSettingsSubmit(e) {
  e.preventDefault();
  const startInput = document.getElementById("flashSaleStartInput");
  const endInput = document.getElementById("flashSaleEndInput");
  const activeToggle = document.getElementById("flashSaleActiveToggle");
  
  if (!startInput || !endInput || !activeToggle) return;
  
  const startVal = startInput.value;
  const endVal = endInput.value;
  
  if (new Date(endVal) <= new Date(startVal)) {
    alert("Error: End Date/Time must be after the Start Date/Time.");
    return;
  }
  
  try {
    const operator = currentCustomer ? currentCustomer.name : "Admin";
    const res = await fetchFromApi("/api/flash-sale/settings", {
      method: "POST",
      headers: {
        "x-operator": operator
      },
      body: JSON.stringify({
        startDate: startVal,
        endDate: endVal,
        isActive: activeToggle.checked
      })
    });
    
    if (res) {
      alert("🎉 Flash Sale settings saved and campaign updated successfully.");
      await loadAllData();
    }
  } catch (err) {
    alert(`Failed to save settings: ${err.message}`);
  }
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.style.background = type === 'success' ? '#2ec4b6' : '#e71d36';
  toast.style.color = '#fff';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.fontWeight = '600';
  toast.style.fontSize = '0.9rem';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(20px)';
  toast.style.transition = 'all 0.3s ease';
  toast.innerHTML = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function renderAdminFlashSaleProducts() {
  const tbody = document.getElementById("adminFlashSaleProductsTableBody");
  if (!tbody) return;
  
  tbody.innerHTML = products.map(p => {
    const dbId = p._id;
    const hasSale = p.salePrice !== undefined && p.salePrice !== null;
    const suggestedSalePrice = hasSale ? p.salePrice : Math.round(p.price * 0.8);
    
    return `
      <tr>
        <td style="display: flex; align-items: center; gap: 10px;">
          <img src="${p.image}" alt="${p.name}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px;">
          <span style="font-weight: 600; font-size: 0.85rem;">${p.name}</span>
        </td>
        <td style="text-transform: capitalize; font-size: 0.85rem;">${p.category}</td>
        <td style="text-align: right; font-weight: 500; font-size: 0.85rem; padding-right: 15px;">
          ₹<input type="number" id="flash-reg-price-${dbId}" value="${p.price}" min="1" oninput="handleFlashRegPriceChange('${dbId}', this.value)" style="width: 70px; padding: 6px; text-align: center; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-card); color: var(--text);">
        </td>
        <td style="text-align: center;">
          <input type="checkbox" id="flash-check-${dbId}" ${hasSale ? 'checked' : ''} onchange="toggleFlashSaleRowInput('${dbId}', this.checked)" style="width: 16px; height: 16px; cursor: pointer;">
        </td>
        <td style="text-align: center;">
          ₹<input type="number" id="flash-price-${dbId}" value="${suggestedSalePrice}" min="1" ${hasSale ? '' : 'disabled'} style="width: 80px; padding: 6px; text-align: center; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-card); color: var(--text);">
        </td>
        <td style="text-align: center;">
          <button class="btn btn-primary btn-small" onclick="saveProductFlashSalePrice('${dbId}')" style="padding: 4px 10px; font-size: 0.75rem;"><i class="fa-solid fa-save"></i> Save</button>
        </td>
      </tr>
    `;
  }).join("");
}

window.handleFlashRegPriceChange = function(productId, regPrice) {
  const checkbox = document.getElementById(`flash-check-${productId}`);
  const priceInput = document.getElementById(`flash-price-${productId}`);
  if (checkbox && priceInput && !checkbox.checked) {
    const parsed = parseInt(regPrice) || 0;
    priceInput.value = Math.round(parsed * 0.8);
  }
};

// Global functions for inline rows (local DOM toggle only, no auto-save reload loops)
window.toggleFlashSaleRowInput = function(productId, isChecked) {
  const priceInput = document.getElementById(`flash-price-${productId}`);
  if (priceInput) {
    priceInput.disabled = !isChecked;
  }
};

window.saveProductFlashSalePrice = async function(productId) {
  const checkbox = document.getElementById(`flash-check-${productId}`);
  const priceInput = document.getElementById(`flash-price-${productId}`);
  const regPriceInput = document.getElementById(`flash-reg-price-${productId}`);
  if (!checkbox || !priceInput || !regPriceInput) return;
  
  const isChecked = checkbox.checked;
  const salePriceVal = priceInput.value.trim();
  const regPriceVal = regPriceInput.value.trim();
  
  try {
    const operator = currentCustomer ? currentCustomer.name : "Admin";
    
    // 1. Update Regular Price if changed
    const newRegPrice = parseInt(regPriceVal) || 0;
    const originalProd = products.find(p => p._id === productId);
    if (originalProd && originalProd.price !== newRegPrice) {
      await fetchFromApi(`/api/products/${productId}/price`, {
        method: 'PUT',
        headers: {
          'x-operator': operator
        },
        body: JSON.stringify({ price: newRegPrice })
      });
    }
    
    // 2. Update Sale Price
    const val = isChecked ? (parseInt(salePriceVal) || 0) : "";
    await fetchFromApi(`/api/products/${productId}/sale-price`, {
      method: 'PUT',
      headers: {
        'x-operator': operator
      },
      body: JSON.stringify({ salePrice: val })
    });
    
    showToast(`Product pricing successfully updated in campaign.`);
    await loadAllData();
  } catch (err) {
    showToast(`Failed to save product pricing: ${err.message}`, 'error');
  }
};

window.loadFlashSaleSettings = loadFlashSaleSettings;
window.handleFlashSaleSettingsSubmit = handleFlashSaleSettingsSubmit;
window.renderAdminFlashSaleProducts = renderAdminFlashSaleProducts;
window.updateProductCost = updateProductCost;

async function handleNewsletterSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById("newsletterEmail");
  if (!emailInput) return;
  
  const email = emailInput.value.trim().toLowerCase();
  try {
    const res = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });
    
    const data = await res.json();
    if (res.ok) {
      alert(data.message || "Thank you for subscribing to our newsletter!");
      emailInput.value = "";
    } else {
      alert(data.error || "Subscription failed. Please check your email and try again.");
    }
  } catch (err) {
    console.error("Newsletter Subscription API Error:", err);
    alert("Thank you for subscribing! (Subscription logged offline)");
    emailInput.value = "";
  }
}

function trackRecentlyViewed(productId) {
  try {
    let recent = JSON.parse(localStorage.getItem('smart_collection_recent_viewed') || '[]');
    recent = recent.filter(id => id !== productId);
    recent.unshift(productId);
    recent = recent.slice(0, 4); // Show up to 4 items
    localStorage.setItem('smart_collection_recent_viewed', JSON.stringify(recent));
    renderRecentlyViewed();
  } catch (err) {
    console.error("Failed to track recently viewed product:", err);
  }
}

function renderRecentlyViewed() {
  const sectionHome = document.getElementById("recentlyViewedSectionHome");
  const gridHome = document.getElementById("recentlyViewedGridHome");
  const sectionShop = document.getElementById("recentlyViewedSectionShop");
  const gridShop = document.getElementById("recentlyViewedGridShop");
  
  if (!gridHome && !gridShop) return;

  try {
    const recentIds = JSON.parse(localStorage.getItem('smart_collection_recent_viewed') || '[]');
    const recentProducts = recentIds
      .map(id => products.find(p => p._id === id))
      .filter(p => p && p.available);

    if (recentProducts.length === 0) {
      if (sectionHome) sectionHome.style.display = "none";
      if (sectionShop) sectionShop.style.display = "none";
      return;
    }

    const cardsHtml = recentProducts.map(p => generateProductCardMarkup(p)).join("");

    if (gridHome && sectionHome) {
      gridHome.innerHTML = cardsHtml;
      sectionHome.style.display = "block";
    }
    if (gridShop && sectionShop) {
      gridShop.innerHTML = cardsHtml;
      sectionShop.style.display = "block";
    }
    
    updateAllProductCardAddButtons();
  } catch (err) {
    console.error("Failed to render recently viewed products:", err);
  }
}

window.clearRecentlyViewed = function() {
  localStorage.removeItem('smart_collection_recent_viewed');
  renderRecentlyViewed();
};

window.toggleExportDropdown = function() {
  const menu = document.getElementById("exportDropdownMenu");
  if (menu) {
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  }
};

// Close dropdown if clicked outside
document.addEventListener("click", (e) => {
  const menu = document.getElementById("exportDropdownMenu");
  if (menu && menu.style.display === "block") {
    if (!e.target.closest(".dropdown-export")) {
      menu.style.display = "none";
    }
  }
});

window.exportSalesReport = function(format) {
  const activeOrders = orders;
  
  if (activeOrders.length === 0) {
    showToast("No orders available to export.", "error");
    return;
  }
  
  const headers = [
    "Order ID", "Date", "Customer Name", "Phone", "Items Purchased", 
    "Revenue (INR)", "Loyalty Discount (INR)", "Wholesale Cost (INR)", 
    "Net Profit (INR)", "Delivery Mode", "Address", "Status"
  ];
  
  const rows = activeOrders.map(o => {
    const isCancelled = o.status === "Cancelled";
    const revenue = isCancelled ? 0 : ((o.subtotal - (o.loyaltyDiscount || 0)) || 0);
    
    const cost = isCancelled ? 0 : o.items.reduce((sum, item) => {
      const prod = products.find(p => p._id === item.productId);
      const itemCost = (prod && prod.cost && prod.cost > 0) ? prod.cost : Math.round((prod ? prod.price : item.price) * 0.6);
      return sum + (itemCost * (item.qty || 1));
    }, 0);
    
    const profit = revenue - cost;
    const itemsStr = o.items.map(item => `${item.name} (x${item.qty})`).join(" | ");
    
    return [
      o.orderId,
      o.date,
      o.customerName,
      o.customerPhone,
      itemsStr,
      revenue,
      o.loyaltyDiscount || 0,
      cost,
      profit,
      o.delivery,
      o.address || "N/A",
      o.status
    ];
  });
  
  if (format === 'csv') {
    let csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(",")].concat(rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Sales report exported to CSV successfully.");
  } else if (format === 'excel') {
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sales Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body>
        <table border="1">
          <thead>
            <tr style="background-color: #5a52ed; color: #ffffff; font-weight: bold;">
              ${headers.map(h => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `<tr>${r.map(val => `<td>${val}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales_report_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Sales report exported to Excel successfully.");
  } else if (format === 'pdf') {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("Pop-up blocker is preventing PDF export.", "error");
      return;
    }
    
    const totalRevAll = rows.reduce((sum, r) => sum + Number(r[5]), 0);
    const totalCostAll = rows.reduce((sum, r) => sum + Number(r[7]), 0);
    const totalProfitAll = totalRevAll - totalCostAll;
    const avgMargin = totalRevAll > 0 ? Math.round((totalProfitAll / totalRevAll) * 100) : 0;
    
    printWindow.document.write(`
      <html>
      <head>
        <title>Sales Report - Smart Collection</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #333; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #5a52ed; padding-bottom: 15px; margin-bottom: 35px; }
          .logo { font-size: 1.6rem; font-weight: 800; color: #5a52ed; }
          .title { font-size: 1.8rem; font-weight: 700; margin: 0; color: #111; }
          .meta-info { text-align: right; font-size: 0.85rem; color: #666; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 35px; }
          .stat-card { border: 1px solid #ddd; padding: 15px; border-radius: 6px; background: #f9f9f9; }
          .stat-title { font-size: 0.75rem; text-transform: uppercase; color: #666; font-weight: bold; margin-bottom: 5px; }
          .stat-value { font-size: 1.4rem; font-weight: bold; color: #111; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.85rem; }
          th { background: #5a52ed; color: #fff; text-align: left; padding: 10px; font-weight: bold; }
          td { border-bottom: 1px solid #ddd; padding: 10px; }
          tr:nth-child(even) { background: #f5f5f5; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="images/logo.jpg" alt="Logo" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;">
            <div>
              <span class="logo" style="font-size: 1.6rem; font-weight: 800; color: #5a52ed;">Smart Collection</span>
              <h1 class="title" style="margin: 0; font-size: 1.8rem; font-weight: 700; color: #111;">Sales Report</h1>
            </div>
          </div>
          <div class="meta-info">
            <p><strong>Export Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
            <p><strong>Location:</strong> Saran, Jalalpur, Bihar</p>
          </div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-title">Total Revenue</div>
            <div class="stat-value">₹${totalRevAll.toLocaleString('en-IN')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Total Cost</div>
            <div class="stat-value">₹${totalCostAll.toLocaleString('en-IN')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Net Profit</div>
            <div class="stat-value">₹${totalProfitAll.toLocaleString('en-IN')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Profit Margin</div>
            <div class="stat-value">${avgMargin}%</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Revenue</th>
              <th>Wholesale Cost</th>
              <th>Net Profit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${activeOrders.map(o => {
              const isCancelled = o.status === "Cancelled";
              const revenue = isCancelled ? 0 : ((o.subtotal - (o.loyaltyDiscount || 0)) || 0);
              const cost = isCancelled ? 0 : o.items.reduce((sum, item) => {
                const prod = products.find(p => p._id === item.productId);
                const itemCost = (prod && prod.cost && prod.cost > 0) ? prod.cost : Math.round((prod ? prod.price : item.price) * 0.6);
                return sum + (itemCost * (item.qty || 1));
              }, 0);
              const profit = revenue - cost;
              return `
                <tr>
                  <td><strong>${o.orderId}</strong></td>
                  <td>${o.date}</td>
                  <td>${o.customerName}<br><small style="color: #666;">${o.customerPhone}</small></td>
                  <td>${o.items.map(item => `${item.name} (${item.qty})`).join("<br>")}</td>
                  <td>₹${revenue.toLocaleString('en-IN')}</td>
                  <td>₹${cost.toLocaleString('en-IN')}</td>
                  <td style="color: ${profit >= 0 ? '#2ec4b6' : '#e71d36'}; font-weight: bold;">₹${profit.toLocaleString('en-IN')}</td>
                  <td><span style="padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; background: ${isCancelled ? '#ffe5e5; color: #e71d36;' : '#e2f9f5; color: #2ec4b6;'}">${o.status}</span></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
        
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};

// ==========================================================================
// Admin Banners Management
// ==========================================================================

// Preview banner image selection instantly
document.addEventListener("change", async (e) => {
  if (e.target && e.target.id === "adminBannerImage") {
    const container = document.getElementById("adminBannerImagePreviewContainer");
    const img = document.getElementById("adminBannerImagePreview");
    if (container && img && e.target.files.length > 0) {
      try {
        const b64 = await convertFileToBase64(e.target.files[0]);
        img.src = b64;
        container.style.display = "block";
      } catch (err) {
        console.error("Failed to preview image:", err);
      }
    }
  }
});

async function renderAdminBanners() {
  const container = document.getElementById("adminBannersTableBody");
  if (!container) return;

  if (banners.length === 0) {
    container.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No banners configured. Add a new banner using the form on the left.</td></tr>`;
    return;
  }

  container.innerHTML = banners.map(b => {
    const bannerImage = (b.image.startsWith('data:') || b.image.startsWith('images/'))
      ? b.image
      : 'images/fashion_banner_2.png';

    const ctaTarget = b.categoryFilter 
      ? `Tab: ${b.ctaTab || 'shop'} (Filter: ${b.categoryFilter})`
      : `Tab: ${b.ctaTab || 'shop'}`;

    return `
      <tr>
        <td style="text-align: center; font-weight: 700;">${b.order || 0}</td>
        <td>
          <img src="${bannerImage}" style="width: 100px; height: 60px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border);">
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text); text-align: left;">${b.title}</div>
          <div style="font-size: 0.82rem; font-weight: 500; color: var(--primary); margin-top: 2px; text-align: left;">${b.subtitle || ''}</div>
          <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.3; max-width: 400px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: left;">${b.description || ''}</p>
        </td>
        <td style="text-align: left;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text);">${ctaTarget}</span><br>
          <small style="color: var(--text-muted); font-size: 0.75rem;">Button: "${b.ctaText || 'Explore Shop'}"</small>
        </td>
        <td style="text-align: center;">
          <input type="checkbox" ${b.isActive ? 'checked' : ''} onchange="toggleBannerActive('${b._id}', this.checked)" style="width: 16px; height: 16px; cursor: pointer;">
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button class="btn btn-secondary btn-small" onclick="editBanner('${b._id}')" style="padding: 5px 10px; font-size: 0.8rem;"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
            <button class="btn btn-danger btn-small" onclick="deleteBanner('${b._id}')" style="padding: 5px 10px; font-size: 0.8rem; background-color: #e71d36; color: #fff; border-color: #e71d36;"><i class="fa-solid fa-trash-can"></i> Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function handleBannerSubmit(event) {
  event.preventDefault();
  
  const idInput = document.getElementById("adminBannerId");
  const titleInput = document.getElementById("adminBannerTitle");
  const subtitleInput = document.getElementById("adminBannerSubtitle");
  const descInput = document.getElementById("adminBannerDesc");
  const fileInput = document.getElementById("adminBannerImage");
  const ctaTextInput = document.getElementById("adminBannerCtaText");
  const ctaTabInput = document.getElementById("adminBannerCtaTab");
  const catFilterInput = document.getElementById("adminBannerCategoryFilter");
  const orderInput = document.getElementById("adminBannerOrder");
  const activeToggle = document.getElementById("adminBannerActiveToggle");

  const bannerId = idInput.value;
  const isEdit = !!bannerId;

  // Validate image
  let imageBase64 = "";
  if (fileInput.files.length > 0) {
    try {
      imageBase64 = await convertFileToBase64(fileInput.files[0]);
    } catch (err) {
      alert("Error reading banner image. Please select a valid image file.");
      return;
    }
  }

  if (!isEdit && !imageBase64) {
    alert("Please select a banner image file.");
    return;
  }

  const payload = {
    title: titleInput.value.trim(),
    subtitle: subtitleInput.value.trim(),
    description: descInput.value.trim(),
    ctaText: ctaTextInput.value.trim() || "Explore Shop",
    ctaTab: ctaTabInput.value,
    categoryFilter: catFilterInput.value,
    order: parseInt(orderInput.value) || 0,
    isActive: activeToggle.checked
  };

  if (imageBase64) {
    payload.image = imageBase64;
  }

  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    const headers = {
      'Content-Type': 'application/json',
      'x-operator': adminOperator
    };

    let savedBanner;
    if (isEdit) {
      savedBanner = await fetchFromApi(`/api/banners/${bannerId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload)
      });
      alert(`Banner "${payload.title}" updated successfully!`);
    } else {
      savedBanner = await fetchFromApi('/api/banners', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
      alert(`Banner "${payload.title}" created successfully!`);
    }

    banners = await fetchFromApi('/api/banners');
    renderStorefrontBanners();
    renderAdminBanners();
    resetBannerForm();
  } catch (err) {
    console.error("Failed to save banner:", err);
    alert(`Failed to save banner: ${err.message}`);
  }
}

function editBanner(id) {
  const banner = banners.find(b => b._id === id);
  if (!banner) return;

  document.getElementById("adminBannerFormTitle").innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Banner`;
  document.getElementById("adminBannerId").value = banner._id;
  document.getElementById("adminBannerTitle").value = banner.title;
  document.getElementById("adminBannerSubtitle").value = banner.subtitle || "";
  document.getElementById("adminBannerDesc").value = banner.description || "";
  document.getElementById("adminBannerCtaText").value = banner.ctaText || "";
  document.getElementById("adminBannerCtaTab").value = banner.ctaTab || "shop";
  document.getElementById("adminBannerCategoryFilter").value = banner.categoryFilter || "";
  document.getElementById("adminBannerOrder").value = banner.order || 0;
  document.getElementById("adminBannerActiveToggle").checked = !!banner.isActive;

  const previewContainer = document.getElementById("adminBannerImagePreviewContainer");
  const previewImg = document.getElementById("adminBannerImagePreview");
  if (previewContainer && previewImg) {
    previewImg.src = (banner.image.startsWith('data:') || banner.image.startsWith('images/'))
      ? banner.image
      : 'images/fashion_banner_2.png';
    previewContainer.style.display = "block";
  }

  document.getElementById("btnAdminBannerCancel").style.display = "inline-block";
  
  document.querySelector(".admin-banners-panel").scrollIntoView({ behavior: 'smooth' });
}

function resetBannerForm() {
  document.getElementById("adminBannerFormTitle").innerHTML = `<i class="fa-solid fa-plus"></i> Add New Banner`;
  document.getElementById("adminBannerForm").reset();
  document.getElementById("adminBannerId").value = "";
  document.getElementById("adminBannerImagePreviewContainer").style.display = "none";
  document.getElementById("adminBannerImagePreview").src = "";
  document.getElementById("btnAdminBannerCancel").style.display = "none";
}

async function toggleBannerActive(id, isActive) {
  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    await fetchFromApi(`/api/banners/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-operator': adminOperator
      },
      body: JSON.stringify({ isActive })
    });
    
    banners = await fetchFromApi('/api/banners');
    renderStorefrontBanners();
    renderAdminBanners();
  } catch (err) {
    console.error("Failed to toggle banner active state:", err);
    alert(`Failed to update status: ${err.message}`);
    renderAdminBanners();
  }
}

async function deleteBanner(id) {
  if (!confirm("Are you sure you want to delete this promotional banner slide? This cannot be undone.")) return;

  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    await fetchFromApi(`/api/banners/${id}`, {
      method: 'DELETE',
      headers: {
        'x-operator': adminOperator
      }
    });

    alert("Banner slide deleted successfully.");
    
    banners = await fetchFromApi('/api/banners');
    renderStorefrontBanners();
    renderAdminBanners();
    
    if (document.getElementById("adminBannerId").value === id) {
      resetBannerForm();
    }
  } catch (err) {
    console.error("Failed to delete banner:", err);
    alert(`Failed to delete banner: ${err.message}`);
  }
}


// ==========================================================================
// Outfit Bundles Storefront and Admin Handlers
// ==========================================================================

function getResolvedProductPrice(p) {
  if (!p) return 0;
  return (p.salePrice && p.salePrice < p.price) ? p.salePrice : p.price;
}

function renderStorefrontBundles() {
  const grid = document.getElementById("storefrontBundlesGrid");
  if (!grid) return;
  const activeBundles = bundles.filter(b => b.isActive && b.productA && b.productB);
  if (activeBundles.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">No outfit bundle deals currently active. Check back soon!</div>`;
    return;
  }
  grid.innerHTML = activeBundles.map(b => {
    const pA = b.productA;
    const pB = b.productB;
    const priceA = getResolvedProductPrice(pA);
    const priceB = getResolvedProductPrice(pB);
    const originalTotal = priceA + priceB;
    const savings = Math.max(0, originalTotal - b.price);
    const savingsPercent = Math.round((savings / originalTotal) * 100);

    return `
      <div class="bundle-card">
        <div>
          <h4 class="bundle-title">${escapeHtml(b.title)}</h4>
          <div class="bundle-subtitle">${escapeHtml(b.subtitle || '')}</div>
          <p class="bundle-desc">${escapeHtml(b.description || '')}</p>
          <div class="bundle-visual">
            <div class="bundle-visual-item" title="${escapeHtml(pA.name)}">
              <img src="${pA.image}" alt="${escapeHtml(pA.name)}">
            </div>
            <div class="bundle-visual-plus"><i class="fa-solid fa-plus"></i></div>
            <div class="bundle-visual-item" title="${escapeHtml(pB.name)}">
              <img src="${pB.image}" alt="${escapeHtml(pB.name)}">
            </div>
          </div>
        </div>
        <div class="bundle-footer-flex">
          <div class="bundle-pricing">
            <div class="bundle-original-price">Original: ₹${originalTotal}</div>
            <div class="bundle-deal-price">₹${b.price}</div>
            ${savings > 0 ? `<div class="bundle-savings-badge">Save ${savingsPercent}% (₹${savings})</div>` : ''}
          </div>
          <button class="btn btn-primary btn-small" onclick="openBundleSizesModal('${b._id}')">
            <i class="fa-solid fa-bolt"></i> One-Click Buy
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function openBundleSizesModal(bundleId) {
  console.log("openBundleSizesModal called with ID:", bundleId);
  console.log("Current bundles in memory:", bundles);
  const bundle = bundles.find(b => b._id === bundleId);
  console.log("Found bundle:", bundle);
  if (!bundle) {
    console.warn("Bundle not found in memory for ID:", bundleId);
    return;
  }
  currentSelectedBundle = { type: 'featured', data: bundle };
  
  const backdrop = document.getElementById("bundleSizesModalBackdrop");
  const modalTitle = document.getElementById("bundleModalTitle");
  const imgA = document.getElementById("bundleModalImgA");
  const nameA = document.getElementById("bundleModalNameA");
  const selectA = document.getElementById("bundleSizeA");
  
  const imgB = document.getElementById("bundleModalImgB");
  const nameB = document.getElementById("bundleModalNameB");
  const selectB = document.getElementById("bundleSizeB");
  
  console.log("DOM elements found:", { backdrop, modalTitle, imgA, nameA, selectA, imgB, nameB, selectB });
  
  if (!backdrop || !imgA || !nameA || !selectA || !imgB || !nameB || !selectB) {
    console.warn("One or more modal elements were missing in the DOM!");
    return;
  }

  
  if (modalTitle) modalTitle.textContent = "Select Bundle Sizes";
  
  const pA = bundle.productA;
  const pB = bundle.productB;
  
  imgA.src = pA.image;
  nameA.textContent = pA.name;
  selectA.innerHTML = pA.sizes.map(s => `<option value="${s}">${s}</option>`).join("");
  
  imgB.src = pB.image;
  nameB.textContent = pB.name;
  selectB.innerHTML = pB.sizes.map(s => `<option value="${s}">${s}</option>`).join("");
  
  backdrop.classList.add("active");
}

function closeBundleSizesModal() {
  const backdrop = document.getElementById("bundleSizesModalBackdrop");
  if (backdrop) backdrop.classList.remove("active");
  currentSelectedBundle = null;
}

function addSplitItemsToCart(pA, sizeA, priceA, pB, sizeB, priceB, bundleTitle) {
  if (!currentCustomer) {
    alert("Please login to add items to your cart.");
    openProfileOrLoginModal();
    return;
  }
  
  // Add Product A
  const cartItemA = cart.find(item => item.id === pA._id && item.size === sizeA && item.price === priceA);
  if (cartItemA) {
    if (cartItemA.qty < pA.stock) {
      cartItemA.qty++;
    } else {
      alert(`Cannot add more. Only ${pA.stock} units left in stock for ${pA.name}!`);
      return;
    }
  } else {
    cart.push({
      id: pA._id,
      name: `${pA.name} [${bundleTitle}]`,
      price: priceA,
      image: pA.image,
      qty: 1,
      size: sizeA
    });
  }
  
  // Add Product B
  const cartItemB = cart.find(item => item.id === pB._id && item.size === sizeB && item.price === priceB);
  if (cartItemB) {
    if (cartItemB.qty < pB.stock) {
      cartItemB.qty++;
    } else {
      alert(`Cannot add more. Only ${pB.stock} units left in stock for ${pB.name}!`);
      return;
    }
  } else {
    cart.push({
      id: pB._id,
      name: `${pB.name} [${bundleTitle}]`,
      price: priceB,
      image: pB.image,
      qty: 1,
      size: sizeB
    });
  }
  
  saveCart();
  updateCartUI();
}

function confirmBundlePurchase(e) {
  if (e) e.preventDefault();
  if (!currentSelectedBundle) return;
  
  const selectA = document.getElementById("bundleSizeA");
  const selectB = document.getElementById("bundleSizeB");
  if (!selectA || !selectB) return;
  
  const sizeA = selectA.value;
  const sizeB = selectB.value;
  
  let pA, pB, bundlePrice, title;
  if (currentSelectedBundle.type === 'featured') {
    const b = currentSelectedBundle.data;
    pA = b.productA;
    pB = b.productB;
    bundlePrice = b.price;
    title = b.title;
  } else if (currentSelectedBundle.type === 'ai') {
    pA = currentSelectedBundle.productA;
    pB = currentSelectedBundle.productB;
    bundlePrice = currentSelectedBundle.price;
    title = "AI Suggested Combo";
  } else {
    return;
  }
  
  // Proportional Split
  const priceA = getResolvedProductPrice(pA);
  const priceB = getResolvedProductPrice(pB);
  const totalOriginal = priceA + priceB;
  
  let splitPriceA = 0;
  let splitPriceB = 0;
  
  if (totalOriginal > 0) {
    splitPriceA = Math.round(priceA * (bundlePrice / totalOriginal));
    splitPriceB = Math.max(0, bundlePrice - splitPriceA);
  } else {
    splitPriceA = Math.round(bundlePrice / 2);
    splitPriceB = bundlePrice - splitPriceA;
  }
  
  addSplitItemsToCart(pA, sizeA, splitPriceA, pB, sizeB, splitPriceB, title);
  
  closeBundleSizesModal();
  toggleCart(true); // Open drawer immediately
}

function generateAiBundle() {
  const categories = ['men', 'girls', 'children'];
  let matchedPair = null;
  let chosenCategory = 'men';
  
  const shuffledCategories = categories.sort(() => 0.5 - Math.random());
  
  for (const cat of shuffledCategories) {
    const catProds = products.filter(p => p.category === cat && p.available && p.stock > 0);
    if (catProds.length >= 2) {
      matchedPair = [catProds[0], catProds[1]];
      chosenCategory = cat;
      break;
    }
  }
  
  if (!matchedPair) {
    const availProds = products.filter(p => p.available && p.stock > 0);
    if (availProds.length >= 2) {
      matchedPair = [availProds[0], availProds[1]];
    }
  }
  
  if (!matchedPair) {
    alert("Not enough products in stock to generate a suggestion combo.");
    return;
  }
  
  const [pA, pB] = matchedPair;
  const priceA = getResolvedProductPrice(pA);
  const priceB = getResolvedProductPrice(pB);
  const originalTotal = priceA + priceB;
  
  const discountPercent = bundleSettings ? bundleSettings.aiDiscount : 20;
  const dealPrice = Math.round(originalTotal * (1 - discountPercent / 100));
  
  currentSelectedBundle = {
    type: 'ai',
    productA: pA,
    productB: pB,
    price: dealPrice
  };
  
  const backdrop = document.getElementById("bundleSizesModalBackdrop");
  const modalTitle = document.getElementById("bundleModalTitle");
  const imgA = document.getElementById("bundleModalImgA");
  const nameA = document.getElementById("bundleModalNameA");
  const selectA = document.getElementById("bundleSizeA");
  
  const imgB = document.getElementById("bundleModalImgB");
  const nameB = document.getElementById("bundleModalNameB");
  const selectB = document.getElementById("bundleSizeB");
  
  if (backdrop && imgA && nameA && selectA && imgB && nameB && selectB) {
    if (modalTitle) {
      modalTitle.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> AI Suggested Combo (${discountPercent}% OFF)`;
    }
    imgA.src = pA.image;
    nameA.textContent = pA.name;
    selectA.innerHTML = pA.sizes.map(s => `<option value="${s}">${s}</option>`).join("");
    
    imgB.src = pB.image;
    nameB.textContent = pB.name;
    selectB.innerHTML = pB.sizes.map(s => `<option value="${s}">${s}</option>`).join("");
    
    backdrop.classList.add("active");
  }
}

function populateMixAndMatchDropdowns() {
  const selectA = document.getElementById("mixMatchItemA");
  const selectB = document.getElementById("mixMatchItemB");
  if (!selectA || !selectB) return;
  
  const activeProds = products.filter(p => p.available && p.stock > 0);
  const optionsHtml = `<option value="">-- Choose Product --</option>` + activeProds.map(p => {
    return `<option value="${p._id}">${escapeHtml(p.name)} - ₹${getResolvedProductPrice(p)}</option>`;
  }).join("");
  
  const valA = selectA.value;
  const valB = selectB.value;
  
  selectA.innerHTML = optionsHtml;
  selectB.innerHTML = optionsHtml;
  
  if (products.find(p => p._id === valA)) selectA.value = valA;
  if (products.find(p => p._id === valB)) selectB.value = valB;
}

function updateMixAndMatchPreview() {
  const selectA = document.getElementById("mixMatchItemA");
  const selectB = document.getElementById("mixMatchItemB");
  
  const sizeContainerA = document.getElementById("mixMatchSizeContainerA");
  const sizeContainerB = document.getElementById("mixMatchSizeContainerB");
  const sizeA = document.getElementById("mixMatchSizeA");
  const sizeB = document.getElementById("mixMatchSizeB");
  
  const placeholder = document.getElementById("mixMatchPlaceholder");
  const activePreview = document.getElementById("mixMatchActivePreview");
  
  if (!selectA || !selectB || !placeholder || !activePreview) return;
  
  const valA = selectA.value;
  const valB = selectB.value;
  
  const pA = products.find(p => p._id === valA);
  const pB = products.find(p => p._id === valB);
  
  if (pA) {
    sizeContainerA.style.display = "flex";
    const prevSize = sizeA.value;
    sizeA.innerHTML = pA.sizes.map(s => `<option value="${s}">${s}</option>`).join("");
    if (pA.sizes.includes(prevSize)) sizeA.value = prevSize;
  } else {
    sizeContainerA.style.display = "none";
  }
  
  if (pB) {
    sizeContainerB.style.display = "flex";
    const prevSize = sizeB.value;
    sizeB.innerHTML = pB.sizes.map(s => `<option value="${s}">${s}</option>`).join("");
    if (pB.sizes.includes(prevSize)) sizeB.value = prevSize;
  } else {
    sizeContainerB.style.display = "none";
  }
  
  if (!pA || !pB) {
    placeholder.style.display = "block";
    activePreview.style.display = "none";
    return;
  }
  
  placeholder.style.display = "none";
  activePreview.style.display = "flex";
  
  document.getElementById("mixMatchPreviewImgA").src = pA.image;
  document.getElementById("mixMatchPreviewImgB").src = pB.image;
  
  const priceA = getResolvedProductPrice(pA);
  const priceB = getResolvedProductPrice(pB);
  const originalTotal = priceA + priceB;
  
  const discountPercent = bundleSettings ? bundleSettings.mixMatchDiscount : 15;
  const dealPrice = Math.round(originalTotal * (1 - discountPercent / 100));
  
  document.getElementById("mixMatchDiscountText").textContent = `${discountPercent}% Bundle Discount Applied!`;
  document.getElementById("mixMatchOriginalTotal").textContent = `₹${originalTotal}`;
  document.getElementById("mixMatchBundleTotal").textContent = `₹${dealPrice}`;
}

function purchaseMixAndMatch() {
  const selectA = document.getElementById("mixMatchItemA");
  const selectB = document.getElementById("mixMatchItemB");
  const sizeSelectA = document.getElementById("mixMatchSizeA");
  const sizeSelectB = document.getElementById("mixMatchSizeB");
  
  if (!selectA || !selectB || !sizeSelectA || !sizeSelectB) return;
  
  const valA = selectA.value;
  const valB = selectB.value;
  const sizeA = sizeSelectA.value;
  const sizeB = sizeSelectB.value;
  
  const pA = products.find(p => p._id === valA);
  const pB = products.find(p => p._id === valB);
  
  if (!pA || !pB || !sizeA || !sizeB) {
    alert("Please select both products and sizes to proceed.");
    return;
  }
  
  if (pA._id === pB._id) {
    alert("Mix & Match deal requires selecting two different products!");
    return;
  }
  
  const priceA = getResolvedProductPrice(pA);
  const priceB = getResolvedProductPrice(pB);
  const originalTotal = priceA + priceB;
  
  const discountPercent = bundleSettings ? bundleSettings.mixMatchDiscount : 15;
  const dealPrice = Math.round(originalTotal * (1 - discountPercent / 100));
  
  let splitPriceA = 0;
  let splitPriceB = 0;
  
  if (originalTotal > 0) {
    splitPriceA = Math.round(priceA * (dealPrice / originalTotal));
    splitPriceB = Math.max(0, dealPrice - splitPriceA);
  } else {
    splitPriceA = Math.round(dealPrice / 2);
    splitPriceB = dealPrice - splitPriceA;
  }
  
  addSplitItemsToCart(pA, sizeA, splitPriceA, pB, sizeB, splitPriceB, "Mix & Match Deal");
  toggleCart(true);
}

async function renderAdminBundles() {
  const tbody = document.getElementById("adminBundlesTableBody");
  if (!tbody) return;
  
  if (bundles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No outfit bundles configured. Add a new bundle using the form on the left.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = bundles.map(b => {
    const pA = b.productA;
    const pB = b.productB;
    const nameA = pA ? pA.name : "Product deleted";
    const nameB = pB ? pB.name : "Product deleted";
    
    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text); text-align: left;">${escapeHtml(b.title)}</div>
          <div style="font-size: 0.82rem; font-weight: 500; color: var(--primary); margin-top: 2px; text-align: left;">${escapeHtml(b.subtitle || '')}</div>
          <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.3; max-width: 300px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: left;">${escapeHtml(b.description || '')}</p>
        </td>
        <td style="font-size: 0.85rem; text-align: left;">${escapeHtml(nameA)}</td>
        <td style="font-size: 0.85rem; text-align: left;">${escapeHtml(nameB)}</td>
        <td style="text-align: right; font-weight: 700; color: var(--primary);">₹${b.price}</td>
        <td style="text-align: center;">
          <input type="checkbox" ${b.isActive ? 'checked' : ''} onchange="toggleBundleActive('${b._id}', this.checked)" style="width: 16px; height: 16px; cursor: pointer;">
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button class="btn btn-secondary btn-small" onclick="editBundle('${b._id}')" style="padding: 5px 10px; font-size: 0.8rem;"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
            <button class="btn btn-danger btn-small" onclick="deleteBundle('${b._id}')" style="padding: 5px 10px; font-size: 0.8rem; background-color: #e71d36; color: #fff; border-color: #e71d36;"><i class="fa-solid fa-trash-can"></i> Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function toggleBundleActive(id, isActive) {
  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    await fetchFromApi(`/api/bundles/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-operator': adminOperator
      },
      body: JSON.stringify({ isActive })
    });
    
    bundles = await fetchFromApi('/api/bundles');
    renderStorefrontBundles();
    renderAdminBundles();
  } catch (err) {
    console.error("Failed to toggle bundle active state:", err);
    alert(`Failed to update status: ${err.message}`);
    renderAdminBundles();
  }
}

function editBundle(id) {
  const bundle = bundles.find(b => b._id === id);
  if (!bundle) return;
  
  document.getElementById("adminBundleFormTitle").innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Bundle`;
  document.getElementById("adminBundleId").value = bundle._id;
  document.getElementById("adminBundleTitle").value = bundle.title;
  document.getElementById("adminBundleSubtitle").value = bundle.subtitle || "";
  document.getElementById("adminBundleDesc").value = bundle.description || "";
  
  const selectA = document.getElementById("adminBundleProductA");
  const selectB = document.getElementById("adminBundleProductB");
  if (selectA && bundle.productA) selectA.value = bundle.productA._id || bundle.productA;
  if (selectB && bundle.productB) selectB.value = bundle.productB._id || bundle.productB;
  
  document.getElementById("adminBundlePrice").value = bundle.price;
  document.getElementById("adminBundleActiveToggle").checked = !!bundle.isActive;
  
  document.getElementById("btnAdminBundleCancel").style.display = "inline-block";
  
  document.querySelector(".admin-bundles-panel").scrollIntoView({ behavior: 'smooth' });
}

function resetBundleForm() {
  document.getElementById("adminBundleFormTitle").innerHTML = `<i class="fa-solid fa-plus"></i> Add New Bundle`;
  document.getElementById("adminBundleForm").reset();
  document.getElementById("adminBundleId").value = "";
  document.getElementById("btnAdminBundleCancel").style.display = "none";
}

async function handleBundleSubmit(event) {
  event.preventDefault();
  
  const idInput = document.getElementById("adminBundleId");
  const titleInput = document.getElementById("adminBundleTitle");
  const subtitleInput = document.getElementById("adminBundleSubtitle");
  const descInput = document.getElementById("adminBundleDesc");
  const selectA = document.getElementById("adminBundleProductA");
  const selectB = document.getElementById("adminBundleProductB");
  const priceInput = document.getElementById("adminBundlePrice");
  const activeToggle = document.getElementById("adminBundleActiveToggle");
  
  if (!titleInput || !selectA || !selectB || !priceInput) return;
  
  const valA = selectA.value;
  const valB = selectB.value;
  
  if (valA === valB) {
    alert("Error: Bundle cannot contain duplicate products. Please choose two different items.");
    return;
  }
  
  const bundleId = idInput.value;
  const isEdit = !!bundleId;
  
  const payload = {
    title: titleInput.value.trim(),
    subtitle: subtitleInput.value.trim(),
    description: descInput.value.trim(),
    productA: valA,
    productB: valB,
    price: parseInt(priceInput.value) || 0,
    isActive: activeToggle.checked
  };
  
  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    const headers = {
      'Content-Type': 'application/json',
      'x-operator': adminOperator
    };
    
    if (isEdit) {
      await fetchFromApi(`/api/bundles/${bundleId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload)
      });
      alert(`Bundle "${payload.title}" updated successfully!`);
    } else {
      await fetchFromApi('/api/bundles', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
      alert(`Bundle "${payload.title}" created successfully!`);
    }
    
    bundles = await fetchFromApi('/api/bundles');
    renderStorefrontBundles();
    populateMixAndMatchDropdowns();
    renderAdminBundles();
    resetBundleForm();
  } catch (err) {
    console.error("Failed to save bundle:", err);
    alert(`Failed to save bundle: ${err.message}`);
  }
}

async function deleteBundle(id) {
  if (!confirm("Are you sure you want to delete this outfit bundle deal? This cannot be undone.")) return;
  
  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    await fetchFromApi(`/api/bundles/${id}`, {
      method: 'DELETE',
      headers: {
        'x-operator': adminOperator
      }
    });
    
    alert("Outfit bundle deal deleted successfully.");
    
    bundles = await fetchFromApi('/api/bundles');
    renderStorefrontBundles();
    populateMixAndMatchDropdowns();
    renderAdminBundles();
    
    if (document.getElementById("adminBundleId").value === id) {
      resetBundleForm();
    }
  } catch (err) {
    console.error("Failed to delete bundle:", err);
    alert(`Failed to delete bundle: ${err.message}`);
  }
}

async function handleBundleSettingsSubmit(event) {
  event.preventDefault();
  
  const mixMatchInput = document.getElementById("adminBundleSettingsMixMatch");
  const aiInput = document.getElementById("adminBundleSettingsAi");
  
  if (!mixMatchInput || !aiInput) return;
  
  const mixMatchDiscount = parseInt(mixMatchInput.value) || 0;
  const aiDiscount = parseInt(aiInput.value) || 0;
  
  try {
    const adminOperator = currentCustomer ? currentCustomer.name : "Admin Manager";
    await fetchFromApi('/api/bundles/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator': adminOperator
      },
      body: JSON.stringify({ mixMatchDiscount, aiDiscount })
    });
    
    alert("🎉 Outfit bundle discount settings updated successfully!");
    bundleSettings = await fetchFromApi('/api/bundles/settings');
    
    updateMixAndMatchPreview();
    renderStorefrontBundles();
  } catch (err) {
    console.error("Failed to save settings:", err);
    alert(`Failed to save settings: ${err.message}`);
  }
}

function populateAdminBundleProductSelects() {
  const selectA = document.getElementById("adminBundleProductA");
  const selectB = document.getElementById("adminBundleProductB");
  if (!selectA || !selectB) return;
  
  const optionsHtml = `<option value="">-- Choose Product --</option>` + products.map(p => {
    return `<option value="${p._id}">${escapeHtml(p.name)} (Price: ₹${p.price})</option>`;
  }).join("");
  
  const valA = selectA.value;
  const valB = selectB.value;
  
  selectA.innerHTML = optionsHtml;
  selectB.innerHTML = optionsHtml;
  
  if (products.find(p => p._id === valA)) selectA.value = valA;
  if (products.find(p => p._id === valB)) selectB.value = valB;
}

function populateAdminBundleSettings() {
  const mixMatchInput = document.getElementById("adminBundleSettingsMixMatch");
  const aiInput = document.getElementById("adminBundleSettingsAi");
  if (!mixMatchInput || !aiInput || !bundleSettings) return;
  
  mixMatchInput.value = bundleSettings.mixMatchDiscount;
  aiInput.value = bundleSettings.aiDiscount;
}

// Bind to window for inline html calling
window.generateAiBundle = generateAiBundle;
window.updateMixAndMatchPreview = updateMixAndMatchPreview;
window.purchaseMixAndMatch = purchaseMixAndMatch;
window.closeBundleSizesModal = closeBundleSizesModal;
window.confirmBundlePurchase = confirmBundlePurchase;
window.openBundleSizesModal = openBundleSizesModal;
window.handleBundleSubmit = handleBundleSubmit;
window.resetBundleForm = resetBundleForm;
window.editBundle = editBundle;
window.deleteBundle = deleteBundle;
window.toggleBundleActive = toggleBundleActive;
window.handleBundleSettingsSubmit = handleBundleSettingsSubmit;
window.getResolvedProductPrice = getResolvedProductPrice;
window.renderStorefrontBundles = renderStorefrontBundles;
window.addSplitItemsToCart = addSplitItemsToCart;
window.renderAdminBundles = renderAdminBundles;
window.populateAdminBundleProductSelects = populateAdminBundleProductSelects;
window.populateAdminBundleSettings = populateAdminBundleSettings;
window.populateMixAndMatchDropdowns = populateMixAndMatchDropdowns;
window.setEventFilter = setEventFilter;
window.filterShopByEvent = filterShopByEvent;
window.updateProductEvent = updateProductEvent;
window.updateExchangeSuggestions = updateExchangeSuggestions;
window.selectExchangeSuggestion = selectExchangeSuggestion;

