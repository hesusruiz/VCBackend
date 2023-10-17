# The module should define two functions: 'authenticate' and 'authorize'.
# 'authenticate' is called when performing authentication, and 'authorize' when
# actually accessing a protected resource.
# The function should determine if the request is allowed and reply
# True (allowed) or False (denied).
#
# The 'authenticate' and 'authorize' functions receive three objects: 'request', 'rawcred' and 'protected_resource'
# 
# 'request' is a dictionary with the following fields:
#    "method": the HTTP method that was used in teh request
#    "host": the host header in the request
#    "remoteip": the IP of the remote host sending the request
#    "url": the complete url of the request
#    "path": the url path until the query parameters
#    "protocol": the 'http' or 'https' protocol
#    "headers": a dictionary with the headres in the HTTP request
#    "pathparams": a dictionary wil all the path parameters
#    "queryparams": a dictionary with all the query parameters in the url
#
# 'rawcred' is a JSON string serialization of the received Verifiable Credential
# 'protected_resource' is the url of the resource that the user is trying to access

def authenticate(request, rawcred, protected_resource):
    print("Inside authenticate")
    credential = json.decode(rawcred)

    # Get the email inside the credentialSubject object
    subject = credential["credentialSubject"]
    email = subject["email"]
    print(email)

    # Only Anna is allowed to access the resource
    if email != "anna.smith@gmaily.com":
        print("invalid email:", email)
        return False

    # If all checks have passed, allow the request
    return True

def authorize(request, rawcred, protected_resource):
    print("Inside Authorize")
    credential = json.decode(rawcred)

    # Get the email inside the credentialSubject object
    subject = credential["credentialSubject"]
    email = subject["email"]
    print(email)

    # Only Anna is allowed to access the resource
    if email != "anna.smith@gmaily.com":
        print("invalid email:", email)
        return False

    # But even Anna can only access Google
    if protected_resource != "https://www.google.com":
        print("invalid protected resource:", protected_resource)
        return False

    # If all checks have passed, allow the request
    return True
