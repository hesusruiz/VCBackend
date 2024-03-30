// front/src/components/jwt.js
var log = window.MHR.log;
function decodeJWT(jwt) {
  let decoded = {
    error: false,
    header: void 0,
    body: void 0,
    signature: void 0
  };
  let components = "";
  if (typeof jwt === "string" || jwt instanceof String) {
    components = jwt.split(".");
  } else {
    decoded.error = "Format error. Encoded credential is not a string";
    log.error(decoded.error);
    return decoded;
  }
  if (components.length != 3) {
    decoded.error = "Malformed JWT, not enough components: " + components.length;
    log.error(decoded.error);
    return decoded;
  }
  try {
    decoded.header = JSON.parse(atobUrl(components[0]));
    decoded.body = JSON.parse(atobUrl(components[1]));
    decoded.signature = components[2];
  } catch (error) {
    decoded.error = "Error parsing header or body";
    log.error(decoded.error);
    return decoded;
  }
  if (!decoded.header) {
    decoded.error = "Field does not exist in JWT (header)";
    log.error(decoded.error);
    return decoded;
  }
  return decoded;
}
function atobUrl(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  let bstr = decodeURIComponent(escape(atob(input)));
  return bstr;
}

export {
  decodeJWT
};
