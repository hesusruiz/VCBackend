import {
  getPlatformOS,
  getPreferredVideoDevice
} from "../chunks/chunk-EFHQYD4G.js";
import {
  html
} from "../chunks/chunk-CRDZSWPZ.js";
import "../chunks/chunk-NZLE2WMY.js";

// front/src/pages/ScanQrPage.js
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var testQRdata = "HC1:NC";
var testQR = {
  text: testQRdata
};
var debugging = false;
var QR_UNKNOWN = 0;
var QR_URL = 1;
var QR_MULTI = 2;
var QR_HC1 = 3;
var QR_Verifiable_Presentation = "QR_VP";
var QR_Verifiable_Issuance = "QR_VI";
var QR_VP_old = "QR_VP_old";
var QR_W3C_VC = "QR_W3C_VC";
MHR.register(
  "ScanQrPage",
  class extends window.MHR.AbstractPage {
    displayPage;
    // The page name used to display the HC1 QR code
    detectionInterval = 200;
    // Milliseconds between attempts to decode QR
    videoElement = {};
    // DOMElement where the video is displayed, reused across invocations
    nativeBarcodeDetector;
    // Instance of the native barcode detector object
    zxingReader;
    // Barcode detector in JavaScript
    lastUsedCameraId;
    // The last used camera ID
    canvasElement;
    canvasSpace;
    constructor(id) {
      super(id);
      if (!("BarcodeDetector" in window)) {
        mylog("Barcode Detector is not supported by this browser.");
        this.zxingPromise = import("../chunks/esm-AO7YE4TC.js");
      } else {
        mylog("Barcode Detector supported!");
        this.nativeBarcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
      }
      this.videoElement = {};
      this.canvasElement = document.createElement("canvas");
      this.canvasSpace = this.canvasElement.getContext("2d");
    }
    // Scan a QR and then route to the proper page to display the QR
    async enter(displayPage) {
      if (!displayPage) {
        displayPage = "LoadAndVerifyQRVC";
      }
      this.displayPage = displayPage;
      if (debugging) {
        await this.processQRpiece(testQR, displayPage);
        return;
      }
      if (!this.nativeBarcodeDetector) {
        let zxing = await this.zxingPromise;
        this.zxingReader = new zxing.BrowserQRCodeReader();
      }
      this.lastUsedCameraId = await this.selectCamera();
      let theHtml = html`<div class="w3-content" style="margin:auto;max-width:500px">
            <video
               style="max-width:500px"
               ref=${this.videoElement}
               oncanPlay=${() => this.canPlay()}
            ></video>
         </div>`;
      this.render(theHtml);
      let constraints;
      if (!this.lastUsedCameraId) {
        mylog("Constraints without camera");
        constraints = {
          audio: false,
          video: {
            // width: { ideal: 1080, max: 1920 },
            facingMode: "environment"
          }
        };
      } else {
        mylog("Constraints with deviceID:", this.lastUsedCameraId);
        constraints = {
          audio: false,
          video: {
            // width: { ideal: 1080, max: 1920 },
            deviceId: this.lastUsedCameraId
          }
        };
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        let videoTracks = stream.getVideoTracks();
        for (let i = 0; i < videoTracks.length; i++) {
          let caps = videoTracks[i].getCapabilities();
          mylog(caps);
        }
        this.videoElement.current.setAttribute("autoplay", "true");
        this.videoElement.current.setAttribute("muted", "true");
        this.videoElement.current.setAttribute("playsinline", "true");
        this.videoElement.current.srcObject = stream;
        mylog(stream);
      } catch (error) {
        log.error("Error getting stream", error);
        window.MHR.gotoPage("ErrorPage", {
          title: "Error getting video stream",
          msg: "There was an error trying to start the camera."
        });
        return;
      }
    }
    async selectCamera() {
      var selectedCameraId = localStorage.getItem("selectedCamera");
      mylog("User selected camera:", selectedCameraId);
      if (!selectedCameraId) {
        selectedCameraId = this.lastUsedCameraId;
        mylog("Last used camera:", selectedCameraId);
      }
      if (!selectedCameraId && "Android" == getPlatformOS()) {
        mylog("We are in Andoid and this is the first time");
        let allVideoDevices;
        try {
          allVideoDevices = await getPreferredVideoDevice();
          mylog("Video devices in Android:", allVideoDevices);
        } catch (error) {
          log.error("Error requesting camera access", error);
        }
        if (allVideoDevices && allVideoDevices.defaultPreferredCamera) {
          selectedCameraId = allVideoDevices.defaultPreferredCamera.deviceId;
          mylog("Selected camera in Android:", selectedCameraId);
        }
        if (!selectedCameraId) {
          mylog("In Android and no selected camera");
        }
      }
      return selectedCameraId;
    }
    // canPlay is called when the video element is ready, so we can start detecting QR codes
    async canPlay() {
      mylog("Video can play, try to detect QR");
      this.videoElement.current.style.display = "block";
      this.videoElement.current.play();
      this.detectCode();
    }
    // Detect code function
    async detectCode() {
      let qrType = QR_UNKNOWN;
      let qrData;
      if (this.nativeBarcodeDetector) {
        let codes;
        try {
          codes = await this.nativeBarcodeDetector.detect(this.videoElement.current);
        } catch (error) {
          log.error(error);
          return;
        }
        if (codes.length === 0) {
          setTimeout(() => this.detectCode(), this.detectionInterval);
          return;
        }
        for (const barcode of codes) {
          mylog(barcode);
          qrData = barcode.rawValue;
          qrType = this.detectQRtype(qrData);
          if (qrType != QR_UNKNOWN) {
            break;
          }
        }
      } else {
        try {
          const result = await this.zxingReader.decodeOnceFromVideoElement(
            this.videoElement.current
          );
          qrData = result.text;
          mylog("RESULT", qrData);
        } catch (error) {
          log.error("ZXING decoding error", error);
        }
        qrType = this.detectQRtype(qrData);
      }
      mylog(`QRTYPE: ${qrType}`);
      if (MHR.debug) {
        alert(qrData);
        alert(qrType);
      }
      if (qrType === QR_UNKNOWN) {
        setTimeout(() => this.detectCode(), this.detectionInterval);
        return;
      }
      if (qrType === QR_VP_old) {
        mylog("Old VP requested, going to ", "AuthenticationRequestPage", qrData);
        window.MHR.gotoPage("AuthenticationRequestPage", qrData);
        return true;
      }
      if (qrType === QR_Verifiable_Presentation) {
        mylog("Going to ", "AuthenticationRequestPage", qrData);
        window.MHR.gotoPage("AuthenticationRequestPage", qrData);
        return true;
      }
      if (qrType === QR_HC1) {
        mylog("Going to ", "DisplayHcert");
        window.MHR.gotoPage("DisplayHcert", qrData);
        return true;
      }
      if (qrType === QR_URL) {
        mylog("Going to ", this.displayPage);
        window.MHR.gotoPage(this.displayPage, qrData);
        return true;
      }
      if (qrType === QR_Verifiable_Issuance) {
        mylog("Going to ", "LoadAndSaveQRVC");
        qrData = qrData.replace("openid-credential-offer://", "https://www.example.com/");
        window.MHR.gotoPage("LoadAndSaveQRVC", qrData);
        return true;
      }
    }
    async exit() {
      if (!this.videoElement.current) {
        return;
      }
      this.videoElement.current.style.display = "none";
      if (this.videoElement.current.srcObject !== void 0) {
        this.videoElement.current.srcObject.getVideoTracks().forEach((track) => {
          track.stop();
        });
      }
    }
    // Try to detect the type of data received
    detectQRtype(qrData) {
      if (!qrData || !qrData.startsWith) {
        log.error("detectQRtype: data is not string");
        return QR_UNKNOWN;
      }
      if (qrData.startsWith("multi|w3cvc|")) {
        return QR_MULTI;
      } else if (qrData.startsWith("openid4vp:")) {
        return QR_Verifiable_Presentation;
      } else if (qrData.startsWith("openid:")) {
        return QR_VP_old;
      } else if (qrData.startsWith("openid-credential-offer://")) {
        return QR_Verifiable_Issuance;
      } else if (qrData.includes("credential_offer_uri=")) {
        return QR_Verifiable_Issuance;
      } else if (qrData.startsWith("VC1:")) {
        return QR_W3C_VC;
      } else if (qrData.startsWith("https")) {
        let params = new URL(qrData).searchParams;
        let jar = params.get("jar");
        if (jar == "yes") {
          return QR_Verifiable_Presentation;
        }
        return QR_URL;
      } else {
        return QR_UNKNOWN;
      }
    }
  }
);
var qrScan = {
  // The page that has invoked the scan
  callerPage: "",
  // The HTML element where the video frames will be placed for analysis
  canvasElement: "",
  // The canvas context with image data
  canvas: "",
  // The element in the page to display messages about status of scanning
  progressMessages: "",
  // The page where thee coded QR will be displayed
  displayQRPage: "",
  // Page that initiated the scanning
  callerType: "",
  // To build the whole JWT from the received pieces
  receivedQRPieces: [],
  receivedPieces: "",
  // The HTML element where the video stream is going to be placed
  video: "",
  // The video stream object
  myStream: ""
};
async function initiateReceiveQRScanning(_canvasElement, _qrMessageElement, _displayQRPage, _callerType) {
  var currentPage = "";
  if (window.history.state != null) {
    currentPage = window.history.state.pageName;
  }
  qrScan["callerPage"] = currentPage;
  qrScan["canvasElement"] = _canvasElement;
  qrScan["progressMessages"] = _qrMessageElement;
  qrScan["displayQRPage"] = _displayQRPage;
  qrScan["callerType"] = _callerType;
  qrScan["receivedQRPieces"] = [];
  qrScan["receivedPieces"] = /* @__PURE__ */ new Set();
  qrScan["canvas"] = qrScan["canvasElement"].getContext("2d");
  qrScan["video"] = document.createElement("video");
  qrScan["canvasElement"].hidden = true;
  qrScan["progressMessages"].innerText = "Waiting for QR .........";
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function(stream) {
    qrScan["myStream"] = stream;
    qrScan["video"].srcObject = stream;
    qrScan["video"].setAttribute("playsinline", true);
    qrScan["video"].play();
    requestAnimationFrame(ReceiveQRtick);
  });
}
async function ReceiveQRtick() {
  try {
    var video = qrScan["video"];
    var canvas = qrScan["canvas"];
    var canvasElement = qrScan["canvasElement"];
    var receivedPieces = qrScan["receivedPieces"];
    var receivedQRPieces = qrScan["receivedQRPieces"];
    var progressMessages = qrScan["progressMessages"];
    var myStream = qrScan["myStream"];
    var callerType = qrScan["callerType"];
    var callerPage = qrScan["callerPage"];
    var displayQRPage = qrScan["displayQRPage"];
    var currentPage = "";
    if (window.history.state != null) {
      currentPage = window.history.state.pageName;
    }
    if (currentPage != callerPage) {
      stopMediaTracks(myStream);
      return;
    }
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(ReceiveQRtick);
      return;
    }
    canvasElement.hidden = false;
    canvasElement.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    let displayWidth = video.videoWidth;
    let displayHeight = video.videoHeight;
    canvas.drawImage(video, 0, 0, displayWidth, displayHeight);
    var imageData = canvas.getImageData(0, 0, displayWidth, displayHeight);
    try {
      var code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert"
      });
    } catch (error) {
      console.error("jsQR:", error);
    }
    if (!code) {
      requestAnimationFrame(ReceiveQRtick);
      return;
    }
    var qrType = detectQRtype(code.data);
    if (qrType == "unknown") {
      requestAnimationFrame(ReceiveQRtick);
      return;
    }
    if (qrType == "MultiJWT") {
      mylog("Scanned MultiJWT QR");
      var components = code.data.split("|");
      var total = components[2];
      var index = components[3];
      var piece = components[4];
      var total1 = total.charCodeAt(0);
      var total2 = total.charCodeAt(1);
      var index1 = index.charCodeAt(0);
      var index2 = index.charCodeAt(1);
      if (total1 < 48 || total1 > 57 || total2 < 48 || total2 > 57 || index1 < 48 || index1 > 57 || index2 < 48 || index2 > 57) {
        requestAnimationFrame(ReceiveQRtick);
        return;
      }
      if (receivedPieces.has(index)) {
        requestAnimationFrame(ReceiveQRtick);
        return;
      }
      receivedPieces.add(index);
      receivedQRPieces[+index] = piece;
      progressMessages.innerText = "Received piece: " + index;
      if (receivedPieces.size < total) {
        requestAnimationFrame(ReceiveQRtick);
        return;
      }
      stopMediaTracks(myStream);
      canvasElement.hidden = true;
      mylog("Received all pieces", receivedQRPieces);
      var jwt = receivedQRPieces.join("");
      mylog("Received jwt", jwt);
      try {
        var cred = decodeJWT(jwt);
        let currentCredential = {
          type: "w3cvc",
          encoded: jwt,
          decoded: cred
        };
        mylog("Writing current cred: ", currentCredential);
        await settingsPut("currentCredential", currentCredential);
      } catch (error) {
        myerror(error);
        progressMessages.innerText = error;
        return;
      }
      window.MHR.gotoPage(displayQRPage, { screenType: callerType });
      return;
    }
    if (qrType == "URL") {
      mylog("Scanned normal URL QR");
      stopMediaTracks(myStream);
      let targetURLRead = code.data.trim();
      if (targetURLRead.startsWith(MYSELF)) {
        const url = new URL(targetURLRead);
        let credId = url.searchParams.get("id");
        if (credId) {
          targetURLRead = ISSUER_GET_CREDENTIAL + credId;
        } else {
          credId = url.searchParams.get("pubid");
          if (credId) {
            targetURLRead = ISSUER_GET_PUBLIC_CREDENTIAL + credId;
          }
        }
      }
      await requestQRAndDisplay(targetURLRead, displayQRPage, callerType);
      return;
    }
    const HC_ISS = 1;
    const HC_IAT = 6;
    const HC_EXP = 4;
    const HC_CTI = 7;
    const HC_HCERT = -260;
    if (qrType == "HC1") {
      mylog("Scanned HC1 QR");
      let plain = await CWT.decodeHC1QR(code.data);
      mylog("CWT.decodeHC1QR", plain);
      let currentCredential = {
        type: "hcert",
        encoded: code.data,
        decoded: plain
      };
      await settingsPut("currentCredential", currentCredential);
      stopMediaTracks(myStream);
      window.MHR.gotoPage(displayQRPage, { screenType: callerType });
      return;
    }
    if (qrType == "Base64") {
      mylog("Scanned Base64 simple QR");
      let decodedQR = JSON.parse(atobUrl(code.data));
      let currentCredential = {
        type: "ukimmigration",
        encoded: code.data,
        decoded: decodedQR
      };
      await settingsPut.setItem("currentCredential", currentCredential);
      stopMediaTracks(myStream);
      window.MHR.gotoPage(displayQRPage, { screenType: callerType });
      return;
    }
  } catch (error) {
    stopMediaTracks(myStream);
    console.error(error);
    alert(`Error: ${error}`);
    window.MHR.gotoPage(homePage);
    return;
  }
}
export {
  initiateReceiveQRScanning
};
