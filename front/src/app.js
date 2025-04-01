// @ts-check

// This is the starting point for the application
// This module starts executing as soon as parsing of the HTML has finished
// We will bootstrap the app and start the loading process for all components

// For rendering the HTML in the pages
import { render, html, svg } from "uhtml";

// Translation support
import "./i18n/tr.js";

// The logo in the header
// @ts-ignore
import logo_img from "./img/logo.png";

// The database operations
import { storage } from "./components/db";
// @ts-ignore
window.myerror = storage.myerror;
// @ts-ignore
window.mylog = storage.mylog;

// Initialise the debug flag based on the current settings
if (!localStorage.getItem("MHRdebug")) {
   localStorage.setItem("MHRdebug", "false");
}

var debug = localStorage.getItem("MHRdebug") == "true";
console.log("DEBUG", debug);

// Prepare for lazy-loading the pages composing the application.
// Typically, the window.pageModules variable is set in the HTML page importing us, but
// it could be overriden (manually) here. It has a structure like this:
//
// window.pageModules = {
//     "DisplayQR": "/pages/DisplayQR-PIO5OPZ6.js",
//     "DisplayVC": "/pages/DisplayVC-7FJXVKLF.js",
//     "LogsPage": "/pages/LogsPage-DHLVIEZ4.js",
//     "MenuPage": "/pages/MenuPage-A455MOK2.js",
//     "MicroWallet": "/pages/MicroWallet-FGPE6TBO.js",
//     "AuthenticationRequestPage": "/pages/AuthenticationRequestPage-2XT6ESFD.js",
//     "SWNotify": "/pages/SWNotify-GLIQS6YO.js",
//     "ScanQrPage": "/pages/ScanQrPage-SMX7ETOS.js",
//     "SelectCamera": "/pages/SelectCamera-PXJHLD5U.js",
// }

// @ts-ignore
const pageModulesMap = window.pageModules;

// Get the base path of the application in runtime
const parsedUrl = new URL(import.meta.url);
const fullPath = parsedUrl.pathname;
console.log("Fullpath of app:", fullPath);
const basePath = fullPath.substring(0, fullPath.lastIndexOf("/"));
console.log("Base path:", basePath);

// Prepend the base path of the application to each page module name
// We do it only if the base path contains more than a '/', which means we are running under a base path
// and the actual JavaScript modules should be loaded under that path
if (basePath.length > 1) {
   for (const path in pageModulesMap) {
      pageModulesMap[path] = basePath + pageModulesMap[path];
   }
}

// *****************************************************
// This is a micro-router with just-enough functionality
//
// Implements gotoPage(pageName, pageData) and goHome()
// *****************************************************

// The default home page where to start and when refreshing the app is set
// in the HTML page importing us in the window.homePage variable.
// @ts-ignore
var homePage = window.homePage;
// @ts-ignore
var myAppTitle = window.myAppTitle;
if (!homePage) {
   throw "No homePage was set.";
}

// The name of the page when we try to go to a non-existent page
var name404 = "Page404";

// This will hold all pages in a ("pageName", pageClass) structure, to facilitate page routing
var pageNameToClass = new Map();

/**
 * Register a new page name, associated to a class instance
 * @param {string} pageName
 * @param {any} classInstance
 */
function route(pageName, classInstance) {
   // Just populate the map
   pageNameToClass.set(pageName, classInstance);
}

// Set the default home page for the application
/**
 * @param {any} page
 */
function setHomePage(page) {
   homePage = page;
}

async function goHome() {
   if (homePage != undefined) {
      await gotoPage(homePage, null);
   }
}

// gotoPage transitions to the target page passing pageData object
// It is up to the page to define the structure of pageData
/**
 * @param {string} pageName
 * @param {any} pageData
 */
async function gotoPage(pageName, pageData) {
   mylog("Inside gotoPage:", pageName);

   // Catch any exceptions and present an error page in case of error
   try {
      // We load dynamically the page if it is not yet loaded
      var pageClass = pageNameToClass.get(pageName);
      if (!pageClass) {
         // Try to load dynamically the page.
         await import(pageModulesMap[pageName]);

         // If pageName still does not exist, go to the 404 error page
         // passing the target page name as pageData
         if (!pageNameToClass.get(pageName)) {
            myerror("Target page does not exist: ", pageName);
            pageData = pageName;
            pageName = name404;
         }
      }

      // Create a new state in the browser history, to support the back button in the browser.
      window.history.pushState({ pageName: pageName, pageData: pageData }, `${pageName}`);

      // Process the page transition
      await processPageEntered(pageNameToClass, pageName, pageData, false);
   } catch (error) {
      myerror(error);
      // Show an error
      await processPageEntered(
         pageNameToClass,
         "ErrorPage",
         { title: error.name, msg: error.message },
         false
      );
   }
}

// Handle page transition
/**
 * @param {Map<string, any>} pageNameToClass
 * @param {string} pageName
 * @param {any} pageData
 * @param {boolean} historyData
 */
async function processPageEntered(pageNameToClass, pageName, pageData, historyData) {
   // Hide all pages of the application. Later we unhide the one we are entering
   // We also tell all other pages to exit, so they can perform any cleanup
   // We call all pages instead of just the active one, because it is more robust and performance does not suffer much
   // @ts-ignore
   for (let [name, classInstance] of pageNameToClass) {
      // Hide the page
      classInstance.domElem.style.display = "none";
      // Call the page exit() method for all pages except the target page, so they can perform any cleanup
      // Implementation of the exit() function is optional, so we check for its existence
      if (name !== pageName && classInstance.exit) {
         try {
            await classInstance.exit();
         } catch (error) {
            // We just log the error and continue the loop
            myerror(`error calling exit() on ${name}: ${error.name}`);
         }
      }
   }

   let targetPage = pageNameToClass.get(pageName);

   // If the target page is not a registered page, go to the Page404 page,
   // passing the target page as pageData
   if (targetPage === undefined) {
      pageData = pageName;
      targetPage = pageNameToClass.get(name404);
   }

   // Reset scroll position to make sure the page is at the top
   // Special treatment is done if we are using Ionic Framework
   const content = document.querySelector("ion-content");
   if (content) {
      // @ts-ignore
      content.scrollToTop(500);
   } else {
      window.scrollTo(0, 0);
   }

   // Invoke the page enter() function to enter the page
   // This will allow the page to create dynamic content
   if (targetPage.enter) {
      await targetPage.enter(pageData, historyData);
   } else {
      // Static pages do not have to implement the enter() method.
      // Dynamic pages control their visibility as they need.
      // For static pages we make sure the target page is visible.
      targetPage.style.display = "block";
   }
}

// Listen for PopStateEvent (navigator Back or Forward buttons are clicked)
window.addEventListener("popstate", async function (event) {
   // Ignore the event if state does not have data
   var state = event.state;
   if (state == null) {
      return;
   }

   console.log(event);

   // Get the page name and data to send
   var pageName = state.pageName;
   var pageData = state.pageData;

   // Process the page transition
   try {
      await processPageEntered(pageNameToClass, pageName, pageData, true);
   } catch (error) {
      myerror(error);
      // Show an error
      await processPageEntered(
         pageNameToClass,
         "ErrorPage",
         { title: error.name, msg: error.message },
         false
      );
   }
});

// Get the version of the application and store in database

/**
 *
 * @returns undefined
 */
async function getAndUpdateVersion() {
   // @ts-ignore
   // let version = import.meta.env.VITE_APP_VERSION
   let version = "1.1.2";

   // Store the version in global Window object and in local storage
   // @ts-ignore
   window.appVersion = version;
   window.localStorage.setItem("VERSION", version);
   console.log("Version:", version);

   return;
}

// When this event is fired the DOM is fully loaded and safe to manipulate
// @ts-ignore
window.addEventListener("DOMContentLoaded", async (event) => {
   console.log("window.DOMContentLoaded event fired");

   // Get the version of the application asynchronously
   getAndUpdateVersion();

   // Go to the home page
   await goHome();

   // Preload the pages of the application in parallel
   for (const path in pageModulesMap) {
      import(pageModulesMap[path]);
   }
});

var INSTALL_SERVICE_WORKER = true;

// This function is called on first load and when a refresh is triggered in any page
// When called the DOM is fully loaded and safe to manipulate
// @ts-ignore
window.addEventListener("load", async (event) => {
   console.log("window.load event fired");

   // Install Service Worker only when in Production
   // @ts-ignore
   if (JR_IN_DEVELOPMENT) {
      console.log("In development");
      INSTALL_SERVICE_WORKER = false;
   } else {
      console.log("In production");
   }

   // Install service worker for off-line support
   if (INSTALL_SERVICE_WORKER && "serviceWorker" in navigator) {
      const { Workbox } = await import("workbox-window");

      const wb = new Workbox("./sw.js");

      wb.addEventListener("message", (event) => {
         if (event.data.type === "CACHE_UPDATED") {
            const { updatedURL } = event.data.payload;

            console.log(`A newer version of ${updatedURL} is available!`);
         }
      });

      wb.addEventListener("activated", async (event) => {
         // `event.isUpdate` will be true if another version of the service
         // worker was controlling the page when this version was registered.
         if (event.isUpdate) {
            console.log("Service worker has been updated.", event);
            await performAppUpgrade(true);
         } else {
            console.log("Service worker has been installed for the first time.", event);
            await performAppUpgrade(false);
         }
      });

      // @ts-ignore
      wb.addEventListener("waiting", (event) => {
         console.log(
            `A new service worker has installed, but it can't activate` +
               `until all tabs running the current version have fully unloaded.`
         );
      });

      // Register the service worker after event listeners have been added.
      wb.register();

      //    const swVersion = await wb.messageSW({ type: "GET_VERSION" });
      //    console.log("Service Worker version:", swVersion);
   }
});

// This is called when a new version of the Service Worker has been activated.
// This means that a new version of the application has been installed
/**
 * @param {boolean} isUpdate
 */
async function performAppUpgrade(isUpdate) {
   console.log("Performing Upgrade");

   // Notify the user and ask to refresh the application
   gotoPage("SWNotify", { isUpdate: isUpdate });
}

// *****************************************************
// HeaderBar definition
// *****************************************************

// @ts-ignore
function toggleMenu() {
   let x = document.getElementById("dropMenu");
   if (x) {
      x.classList.toggle("hidden");
   }
}
function hideMenu() {
   let x = document.getElementById("dropMenu");
   if (x) {
      x.classList.add("hidden");
   }
}
/**
 * @param {string} e
 */
function T(e) {
   // @ts-ignore
   if (window.T) {
      // @ts-ignore
      return window.T(e);
   }
   return e;
}

/**
 * @param {boolean} backButton - If true, a back button is shown in the header
 * @param {string} loginData? - Login data to show in header
 *
 * @returns {import("uhtml").Renderable} The HTML structure.
 */
function HeaderBar(backButton = true, loginData) {
   var backButtonHTML;
   if (backButton) {
      backButtonHTML = html` <ion-buttons slot="start">
         <ion-button @click=${() => history.back()}>
            <ion-icon slot="start" name="chevron-back"></ion-icon>
            Back
         </ion-button>
      </ion-buttons>`;
   }

   var menuButton = html` <ion-buttons slot="end">
      <ion-button @click=${() => gotoPage("MenuPage", "")}>
         <ion-icon name="menu"></ion-icon>
      </ion-button>
   </ion-buttons>`;

   return html`
      <ion-toolbar color="primary">
         ${backButtonHTML}
         <ion-title>${loginData ? loginData : myAppTitle}</ion-title>
         ${menuButton}
      </ion-toolbar>
   `;
}

/**
 * Generates an HTML structure for an error panel using the provided title, message, and optional details.
 *
 * @param {string} title - The title of the error panel.
 * @param {string} message - The main message to display in the error panel.
 * @param {string} [details] - Optional additional details to display in the error panel.
 *
 * @returns {import("uhtml").Renderable} The HTML structure for the error panel.
 */
function ErrorPanel(title, message, details) {
   let theHtml = html`
      <ion-card>
         <ion-card-header>
            <ion-card-title>${title}</ion-card-title>
         </ion-card-header>

         <ion-card-content class="ion-padding-bottom">
            <div class="text-larger">${message}</div>
         </ion-card-content>

         ${details
            ? html`
                 <ion-card-content class="ion-padding-bottom">
                    <div class="text-medium">${details}</div>
                 </ion-card-content>
              `
            : null}

         <div class="ion-margin-start ion-margin-bottom">
            <ion-button color="danger" @click=${() => cleanReload()}>
               <ion-icon slot="start" name="home"></ion-icon>
               ${T("Home")}
            </ion-button>
         </div>
      </ion-card>
   `;

   return theHtml;
}

// **************************************************************
// AbstractPage is the superclass of all pages in the application
// **************************************************************

class AbstractPage {
   html; // The uhtml html function, for subclasses
   domElem; // The DOM Element that holds the page
   pageName; // The name of the page for routing
   headerBar = HeaderBar;
   loginData = "";

   /**
    * @param {string} id - The name of the page to be registered. This will be used for page routing
    */
   constructor(id) {
      if (!id) {
         throw "A page name is needed";
      }

      // Set the 'html' and 'svg' tag function so subclasses do not have to import 'uhtml'
      this.html = html;
      this.svg = svg;

      // Create a <div> tag to contain the page
      this.domElem = document.createElement("page");

      // Set the id and name of the page for routing
      this.pageName = id;
      this.domElem.id = id;

      // Register the page in the router
      route(this.pageName, this);

      // The page starts hidden
      this.domElem.style.display = "none";

      // Insert into the DOM inside the <main> element and after pages registered before
      var mainElem = document.querySelector("main");
      if (mainElem) {
         mainElem.appendChild(this.domElem);
      }
   }

   /**
    * @param {import("uhtml").Renderable} theHtml
    * @param {boolean} [backButton=true]
    */
   render(theHtml, backButton = true) {
      // This is called by subclasses to render its contents

      // Hide the Splash Screen (just in case it was being displayed)
      let elem = document.getElementById("SplashScreen");
      if (elem) {
         elem.style.display = "none";
      }

      // Mark the page as visible
      this.domElem.style.display = "block";

      // Redraw the header just in case the menu was active
      // The caller can specify if the back button has to be displayed in the header
      let header = document.getElementById("the_header");
      if (header) {
         render(header, HeaderBar(backButton, this.loginData));
      }

      // Render the html of the page into the DOM element of this page
      render(this.domElem, theHtml);
   }

   /**
    * @param {string} title
    * @param {string} message
    * @param {string} details
    */
   showError(title, message, details) {
      this.render(ErrorPanel(title, message, details));
   }
}

/**
 * @param {string} pageName
 * @param {any} classDefinition
 */
function register(pageName, classDefinition) {
   // Just create an instance. The constructor will take care of everything else
   new classDefinition(pageName);
}

function cleanReload() {
   // Reload the application with a clean URL
   //@ts-ignore
   window.location = window.location.origin + window.location.pathname;
   return;
}

register(
   "Page404",
   class extends AbstractPage {
      /**
       * @param {string} id
       */
      constructor(id) {
         super(id);
      }

      /**
       * @param {string} pageData
       */
      enter(pageData) {
         this.showError("Page not found", `The requested page does not exist: ${pageData}`, "");
      }
   }
);

register(
   "ErrorPage",
   class extends AbstractPage {
      /**
       * @param {string} id
       */
      constructor(id) {
         super(id);
      }

      /**
       * @param {{title:string; msg:string; details:string; back:boolean; level:string}} pageData
       */
      enter(pageData) {
         let html = this.html;
         if (!pageData) {
            pageData = {
               title: "Error",
               msg: "An error has happened",
               details: "",
               back: false,
               level: "error",
            };
         }

         // We expect pageData to be an object with four fields:
         // - title: the string to be used for the title of the error page
         // - msg: the string with the details of the error
         // - back: a boolean indicating if a back button must be displayed
         // - level: a string with the level ("error", "warning", "info")

         // Provide a default title if the user did not set the title
         let title = T("Error");
         if (pageData.title) {
            title = T(pageData.title);
         }

         //Provide a default message if the user did not specify it
         let msg = T("An error has happened.");
         if (pageData.msg) {
            msg = T(pageData.msg);
         }

         //Provide a default color for the button in the page
         let color = "danger";
         if (pageData.level == "info") {
            color = "primary";
         } else if (pageData.level == "warning") {
            color = "warning";
         }

         // Display the title and message, with a button that reloads the whole application
         let theHtml = html`
            <ion-card>
               <ion-card-header>
                  <ion-card-title>${title}</ion-card-title>
               </ion-card-header>

               <ion-card-content class="ion-padding-bottom">
                  <div class="text-larger">${msg}</div>

                  ${pageData.details
                     ? html` <div class="text-medium">${pageData.details}</div> `
                     : null}
               </ion-card-content>

               ${pageData.back == true
                  ? null
                  : html`
                       <ion-card-content class="ion-padding-bottom">
                          <div>${T("Please click Accept to refresh the page.")}</div>
                       </ion-card-content>
                    `}

               <div class="ion-margin-start ion-margin-bottom">
                  ${pageData.back == true
                     ? html` <ion-button .color=${color} @click=${() => history.back()}>
                          <ion-icon slot="start" name="chevron-back"></ion-icon>${T("Back")}
                       </ion-button>`
                     : html` <ion-button .color=${color} @click=${() => cleanReload()}
                          >${T("Accept")}
                       </ion-button>`}
               </div>
            </ion-card>
         `;
         this.render(theHtml, pageData.back);
      }
   }
);

/**
 * @param {string} input
 */
function btoaUrl(input) {
   // Encode using the standard Javascript function
   let astr = btoa(input);

   // Replace non-url compatible chars with base64 standard chars
   astr = astr.replace(/\+/g, "-").replace(/\//g, "_");

   return astr;
}

/**
 * @param {string} input
 */
function atobUrl(input) {
   // Replace non-url compatible chars with base64 standard chars
   input = input.replace(/-/g, "+").replace(/_/g, "/");

   // Decode using the standard Javascript function
   let bstr = decodeURIComponent(escape(atob(input)));

   return bstr;
}

// This module exports the `MHR` object into the global namespace, where we will add
// the relevant functions that we want globally available to other modules.
// This way they do not have to import us (and avoid circular references in some cases) and
// we do not pollute the global namespace with our functions and variables

// @ts-ignore
globalThis.MHR = {
   debug: debug,
   mylog: storage.mylog,
   storage: storage,
   route: route,
   goHome: goHome,
   gotoPage: gotoPage,
   processPageEntered: processPageEntered,
   // @ts-ignore
   AbstractPage: AbstractPage,
   register: register,
   ErrorPanel: ErrorPanel,
   cleanReload: cleanReload,
   html: html,
   render: render,
   btoaUrl: btoaUrl,
   atobUrl: atobUrl,
   pageNameToClass: pageNameToClass,
};
