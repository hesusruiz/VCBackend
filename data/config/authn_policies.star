""" This module should define two functions: 'authenticate' and 'authorize'.
- 'authenticate' is called when performing authentication, and
- 'authorize' is called when actually accessing a protected resource.

Each of those functions should determine if the request is allowed and reply
True (allowed) or False (denied).

The 'authenticate' and 'authorize' functions receive three objects: 'request', 'rawcred' and 'protected_resource'

"request" is a dictionary with the following fields:
"method": the HTTP method that was used in teh request
"host": the host header in the request
"remoteip": the IP of the remote host sending the request
"url": the complete url of the request
"path": the url path until the query parameters
"protocol": the 'http' or 'https' protocol
"headers": a dictionary with the headres in the HTTP request
"pathparams": a dictionary wil all the path parameters
"queryparams": a dictionary with all the query parameters in the url

'rawcred' is a JSON string serialization of the received Verifiable Credential
'protected_resource' is the url of the resource that the user is trying to access
"""

def authenticate(request, rawcred, protected_resource):
    """authenticate determines if a user can be authenticated or not.

    Args:
        request: the HTTP request received.
        rawcred: the raw credential encoded in string format.
        protected_resource: the url of the resource that the user is intending to access.

    Returns:
        True or False, for allowing authentication or denying it, respectively.
    """
    print("Inside authenticate")
    credential = json.decode(rawcred)

    ## Get the MANDATEE information from the credential
    mandatee = credential["credentialSubject"]["mandate"]["mandatee"]
    email = mandatee["email"]
    first_name = mandatee["first_name"]
    last_name = mandatee["last_name"]
    print(first_name, last_name, email)

    # Get the MANDATOR information from the credential
    mandator = credential["credentialSubject"]["mandate"]["mandator"]
    mandator_id = mandator["organizationIdentifier"]
    mandator_org_name = mandator["Organization"]
    mandator_representative = mandator["commonName"]
    print("organizationIdentifier:", mandator_id, "Org Name:", mandator_org_name, "Legal Representative:", mandator_representative)

    # Get the POWERS information from the credential
    powers = credential["credentialSubject"]["mandate"]["power"]

    ###############################################################################
    # This is where the real action comes. You can specify the rules that you need
    ###############################################################################

    if credentialIncludesPower(credential, "Execute", "Onboarding", "DOME"):
        return True

    # If we reached here, deny the request
    return False

# authorize is called for every access to a given protected resource
def authorize(request, rawcred, protected_resource):

    # In this example, we authorize all calls
    return True


###############################################################################
# Auxiliary functions
###############################################################################


def credentialIncludesPower(credential, action, function, domain):
    """credentialIncludesPower determines if a given power is incuded in the credential.

    Args:
        credential: the received credential.
        action: the action that should be allowed.
        function: the function that should be allowed.
        domain: the domain that should be allowed.

    Returns:
        True or False, for allowing authentication or denying it, respectively.
    """

    # Get the POWERS information from the credential
    powers = credential["credentialSubject"]["mandate"]["power"]

    # Check all possible powers in the mandate
    for power in powers:
        # Approve if the power includes the required one
        if (power["tmf_function"] == function) and (domain in powers["tmf_domain"]) and (action in power["tmf_action"]):
            return True

    # We did not find any complying power, so Deny
    return False
