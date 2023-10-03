# The module should define an 'authenticate' function that will be called
# by the runtime with the VC as an argument.
# The function should determine if the request is authenticated and reply
# with the userID if authenticated, or an empty string if not authenticated
def authenticate(credential):
    cred = json.decode(credential)
    subject = cred["credentialSubject"]
    email = subject["email"]

    print("Inside StarLark. email:", email)

    # Return the userID if authenticated, or an empty string if not authenticated
    return email
