import {
  html,
  render
} from "./chunks/chunk-65N62L2T.js";
import {
  log
} from "./chunks/chunk-FVTRWWP3.js";
import "./chunks/chunk-KRYK5JSZ.js";

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

// front/src/img/logo.png
var logo_default = "data:image/png;base64,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";

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
var pages = /* @__PURE__ */ new Map();
function route(pageName, classInstance) {
  pages.set(pageName, classInstance);
}
async function goHome() {
  if (homePage != void 0) {
    await gotoPage(homePage);
  }
}
async function gotoPage(pageName, pageData) {
  console.log("Inside gotoPage:", pageName);
  var pageFunction = pageModulesMap[pageName];
  if (!pageFunction) {
    log.error("Target page does not exist: ", pageName);
    pageData = pageName;
    pageName = name404;
    await import(pageModulesMap[pageName]);
  }
  await import(pageModulesMap[pageName]);
  window.history.pushState(
    { pageName, pageData },
    `${pageName}`
  );
  await processPageEntered(pageName, pageData, false);
}
async function processPageEntered(pageName, pageData, historyData) {
  try {
    for (let [name, classInstance] of pages) {
      classInstance.domElem.style.display = "none";
      if (name !== pageName && classInstance.exit) {
        await classInstance.exit();
      }
    }
  } catch (error) {
    log.error("Trying to call exit", error);
    return;
  }
  let targetPage = pages.get(pageName);
  if (targetPage === void 0) {
    pageData = pageName;
    targetPage = pages.get(name404);
  }
  window.scrollTo(0, 0);
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
    console.log("Dyn loading", pageModulesMap[path]);
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
    const { Workbox } = await import("./chunks/workbox-window.prod.es5-KCOBJWBW.js");
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
function resetAndGoHome(e) {
  HeaderBar(false);
  if (window.MHR.goHome) {
    goHome();
  }
}
function HeaderBar(menu = false) {
  let header = document.querySelector("header");
  var subMenu = html``;
  var flag = !menu;
  if (menu) {
    subMenu = html`
        <div id="mainmenu" class="w3-bar-block w3-card color-medium">
            ${window.menuItems.map(
      ({ page, params, text }) => html`<a href="#" class="w3-bar-item w3-button" onclick=${() => {
        HeaderBar();
        gotoPage(page, params);
      }}>${text}</a>`
    )}
        </div>
        `;
  }
  var fullHB = html`
<div class="w3-bar w3-card w3-large color-primary">
    <a class="w3-bar-item w3-btn" onclick=${() => resetAndGoHome()}>
        <img style="height:1.5em; margin-bottom:5px" src=${logo_default} alt="EvidenceLedger logo">
    </a>
    <div class="w3-bar-item">Privacy Wallet</div>
    <a class="w3-bar-item w3-btn w3-right" onclick=${() => HeaderBar(flag)}>☰</a>
</div>

${subMenu}    
`;
  render(header, fullHB);
  return;
}
function ErrorPanel(title, message) {
  let theHtml = html`
    <div class="w3-container w3-padding-64">
        <div class="w3-card-4 w3-center">
    
            <header class="w3-container w3-center color-primary">
                <h3>${title}</h3>
            </header>
    
            <div class="w3-container">
                <p>${message}</p>
                <p>${T2("Please click Accept to refresh the page.")}</p>
            </div>
            
            <div class="w3-container w3-center w3-padding">
                <btn-primary onclick=${() => window.location.reload()}>${T2("Accept")}</btn-primary>        
            </div>

        </div>
    </div>
    `;
  return theHtml;
}
var AbstractPage = class {
  html;
  domElem;
  pageName;
  constructor(id) {
    if (!id) {
      throw "A page name is needed";
    }
    this.html = html;
    this.domElem = document.createElement("page");
    this.pageName = id;
    this.domElem.id = id;
    route(this.pageName, this);
    this.domElem.style.display = "none";
    var mainElem = document.querySelector("main");
    if (mainElem) {
      mainElem.appendChild(this.domElem);
    }
    console.log("Page constructor:", id);
  }
  render(theHtml) {
    let elem = document.getElementById("SplashScreen");
    if (elem) {
      elem.style.display = "none";
    }
    this.domElem.style.display = "block";
    HeaderBar();
    render(this.domElem, theHtml);
  }
};
function register(pageName, classDefinition) {
  let instance = new classDefinition(pageName);
}
window.MHR = {
  route,
  goHome,
  gotoPage,
  AbstractPage,
  register,
  ErrorPanel
};
