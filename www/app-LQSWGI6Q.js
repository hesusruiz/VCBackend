import {
  storage
} from "./chunks/chunk-TLQAWBTC.js";
import {
  log
} from "./chunks/chunk-BFXLU5VG.js";
import {
  html,
  render,
  svg
} from "./chunks/chunk-U2D4LOFI.js";
import "./chunks/chunk-66PNVI35.js";

// front/src/i18n/translations.js
var translations = {
  "$intro01": {
    "en": "This application allows the verification of COVID certificates issued by EU Member States and also certificates issued by the UK Government with the same format as the EU Digital COVID Certificate",
    "es": "Esta aplicación permite la verificación de certificados COVID emitidos por los Estados Miembro de la UE y también los certificados emitidos por el Reino Unido con el mismo formato que el Certificado COVID Digital de la UE",
    "ca": "Aquesta aplicació permet la verificació dels certificats COVID emesos pels Estats membres de la UE i també els certificats emesos pel Regne Unit en el mateix format que el Certificat COVID digital de la UE",
    "fr": "Cette application permet de vérifier les certificats COVID émis par les États membres de l'UE, ainsi que les certificats émis par le gouvernement britannique sous le même format que le certificat COVID numérique de l'UE.",
    "de": "Diese Anwendung ermöglicht die Überprüfung von COVID-Zertifikaten, die von EU-Mitgliedstaaten ausgestellt wurden, sowie von Zertifikaten, die von der britischen Regierung ausgestellt wurden und dasselbe Format wie das digitale COVID-Zertifikat der EU haben.",
    "it": "Questa applicazione consente di verificare i certificati COVID rilasciati dagli stati membri dell'UE nonché i certificati rilasciati dal governo del Regno Unito con lo stesso formato del certificato digitale COVID UE"
  },
  "EU Digital COVID Credential Verifier": {
    "es": "Verificador de Credenciales COVID",
    "ca": "Verificador de Credencials COVID",
    "fr": "Outil de vérification numérique des justificatifs COVID de l'UE",
    "de": "Digitale COVID-Anmeldeinformationsüberprüfung in der EU",
    "it": "Strumento di verifica del certificato digitale COVID UE"
  }
};

// front/src/i18n/tr.js
var preferredLanguage = "ca";
var l = localStorage.getItem("preferredLanguage");
if (l) {
  preferredLanguage = l;
}
window.preferredLanguage = preferredLanguage;
function T(key) {
  if (window.preferredLanguage === "en" && key.charAt(0) != "$") {
    return key;
  }
  let entry = translations[key];
  if (entry === void 0) {
    return key;
  }
  let translated = entry[window.preferredLanguage];
  if (translated === void 0) {
    return key;
  }
  return translated;
}
window.T = T;

// front/src/app.js
var pageModulesMap = window.pageModules;
var parsedUrl = new URL(import.meta.url);
var fullPath = parsedUrl.pathname;
console.log(fullPath);
var basePath = fullPath.substring(0, fullPath.lastIndexOf("/"));
console.log(basePath);
if (basePath.length > 1) {
  for (const path in pageModulesMap) {
    pageModulesMap[path] = basePath + pageModulesMap[path];
  }
}
var homePage = window.homePage;
if (!homePage) {
  throw "No homePage was set.";
}
var name404 = "Page404";
var pageNameToClass = /* @__PURE__ */ new Map();
function route(pageName, classInstance) {
  pageNameToClass.set(pageName, classInstance);
}
async function goHome() {
  if (homePage != void 0) {
    await gotoPage(homePage, null);
  }
}
async function gotoPage(pageName, pageData) {
  log.log("Inside gotoPage:", pageName);
  var pageClass = pageNameToClass.get(pageName);
  if (!pageClass) {
    try {
      await import(pageModulesMap[pageName]);
    } catch (error) {
      log.error(error);
    }
    if (!pageNameToClass.get(pageName)) {
      log.error("Target page does not exist: ", pageName);
      pageData = pageName;
      pageName = name404;
    }
  }
  window.history.pushState(
    { pageName, pageData },
    `${pageName}`
  );
  await processPageEntered(pageName, pageData, false);
}
async function processPageEntered(pageName, pageData, historyData) {
  try {
    for (let [name, classInstance] of pageNameToClass) {
      classInstance.domElem.style.display = "none";
      if (name !== pageName && classInstance.exit) {
        await classInstance.exit();
      }
    }
  } catch (error) {
    log.error("Trying to call exit", error);
    return;
  }
  let targetPage = pageNameToClass.get(pageName);
  if (targetPage === void 0) {
    pageData = pageName;
    targetPage = pageNameToClass.get(name404);
  }
  const content = document.querySelector("ion-content");
  if (content) {
    content.scrollToTop(500);
  }
  try {
    if (targetPage.enter) {
      await targetPage.enter(pageData, historyData);
    } else {
      targetPage.style.display = "block";
    }
  } catch (error) {
    log.error("Calling enter()", error);
    return;
  }
}
window.addEventListener("popstate", async function(event) {
  var state = event.state;
  if (state == null) {
    return;
  }
  console.log(event);
  var pageName = state.pageName;
  var pageData = state.pageData;
  await processPageEntered(pageName, pageData, true);
});
async function getAndUpdateVersion() {
  let version = "1.1.1";
  window.appVersion = version;
  window.localStorage.setItem("VERSION", version);
  console.log("Version:", version);
  return;
}
window.addEventListener("DOMContentLoaded", async (event) => {
  console.log("DOMContentLoaded");
  getAndUpdateVersion();
  await goHome();
  for (const path in pageModulesMap) {
    import(pageModulesMap[path]);
  }
});
var INSTALL_SERVICE_WORKER = true;
window.addEventListener("load", async (event) => {
  console.log("load");
  if (true) {
    console.log("In development");
    INSTALL_SERVICE_WORKER = false;
  } else {
    console.log("In production");
  }
  if (INSTALL_SERVICE_WORKER && "serviceWorker" in navigator) {
    const { Workbox } = await import("./chunks/workbox-window.prod.es5-4GWLKTMN.js");
    const wb = new Workbox("./sw.js");
    wb.addEventListener("message", (event2) => {
      if (event2.data.type === "CACHE_UPDATED") {
        const { updatedURL } = event2.data.payload;
        console.log(`A newer version of ${updatedURL} is available!`);
      }
    });
    wb.addEventListener("activated", async (event2) => {
      if (event2.isUpdate) {
        console.log("Service worker has been updated.", event2);
        await performAppUpgrade(true);
      } else {
        console.log("Service worker has been installed for the first time.", event2);
        await performAppUpgrade(false);
      }
    });
    wb.addEventListener("waiting", (event2) => {
      console.log(
        `A new service worker has installed, but it can't activateuntil all tabs running the current version have fully unloaded.`
      );
    });
    wb.register();
  }
});
async function performAppUpgrade(isUpdate) {
  console.log("Performing Upgrade");
  gotoPage("SWNotify", { isUpdate });
}
function T2(e) {
  if (window.T) {
    return window.T(e);
  }
  return e;
}
function HeaderBar(backButton = true) {
  var menuB = html`
        <ion-buttons slot="end">
        </ion-buttons>
    `;
  if (!backButton) {
    menuB = html`
        <ion-buttons slot="end">
            <ion-button @click=${() => gotoPage("MenuPage", "")}>
                <ion-icon name="menu"></ion-icon>
            </ion-button>
        </ion-buttons>`;
  }
  if (backButton) {
    return html`
        <ion-toolbar color="primary">
        <ion-buttons slot="start">
            <ion-button @click=${() => history.back()}>
                <ion-icon slot="start" name="chevron-back"></ion-icon>
                Back
            </ion-button>
        </ion-buttons>
        <ion-title>Privacy Wallet</ion-title>
        ${menuB}
        </ion-toolbar>
        `;
  } else {
    return html`
        <ion-toolbar color="primary">
        <ion-title>Privacy Wallet</ion-title>
        ${menuB}
        </ion-toolbar>
    `;
  }
}
function ErrorPanel(title, message) {
  let theHtml = html`

    <ion-card>
        <ion-card-header>
            <ion-card-title>${title}</ion-card-title>
        </ion-card-header>

        <ion-card-content class="ion-padding-bottom">
            <div class="text-larger">${message}</div>
        </ion-card-content>

        <div class="ion-margin-start ion-margin-bottom">

            <ion-button color="danger" @click=${() => cleanReload()}>
                <ion-icon slot="start" name="home"></ion-icon>
                ${T2("Home")}
            </ion-button>

        </div>
    </ion-card>
    `;
  return theHtml;
}
var AbstractPage = class {
  html;
  // The uhtml html function, for subclasses
  domElem;
  // The DOM Element that holds the page
  pageName;
  // The name of the page for routing
  headerBar = HeaderBar;
  /**
   * @param {string} id
   */
  constructor(id) {
    if (!id) {
      throw "A page name is needed";
    }
    this.html = html;
    this.svg = svg;
    this.domElem = document.createElement("page");
    this.pageName = id;
    this.domElem.id = id;
    route(this.pageName, this);
    this.domElem.style.display = "none";
    var mainElem = document.querySelector("main");
    if (mainElem) {
      mainElem.appendChild(this.domElem);
    }
  }
  /**
   * @param {(() => import("uhtml").Renderable) | import("uhtml").Renderable} theHtml
   */
  render(theHtml, backButton = true) {
    let elem = document.getElementById("SplashScreen");
    if (elem) {
      elem.style.display = "none";
    }
    this.domElem.style.display = "block";
    let header = document.getElementById("the_header");
    if (header) {
      render(header, HeaderBar(backButton));
    }
    render(this.domElem, theHtml);
  }
  /**
   * @param {string} title
   * @param {string} message
   */
  showError(title, message) {
    this.render(ErrorPanel(title, message));
  }
};
function register(pageName, classDefinition) {
  new classDefinition(pageName);
}
function cleanReload() {
  window.location = window.location.origin + window.location.pathname;
  return;
}
register("Page404", class extends AbstractPage {
  /**
   * @param {string} id
   */
  constructor(id) {
    super(id);
  }
  /**
   * @param {any} pageData
   */
  enter(pageData) {
    this.showError("Page not found", `The requested page does not exist: ${pageData}`);
  }
});
function btoaUrl(input) {
  let astr = btoa(input);
  astr = astr.replace(/\+/g, "-").replace(/\//g, "_");
  return astr;
}
function atobUrl(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  let bstr = decodeURIComponent(escape(atob(input)));
  return bstr;
}
window.MHR = {
  log,
  storage,
  route,
  goHome,
  gotoPage,
  processPageEntered,
  AbstractPage,
  register,
  ErrorPanel,
  cleanReload,
  html,
  render,
  btoaUrl,
  atobUrl
};
