# The module should define an 'authenticate' function that will be called
# by the runtime with the HTTP Request as an argument.
# The function should determine if the request is authenticated and reply
# with the userID if authenticated, or an empty string if not authenticated
def authenticate(request):
    print("Content Length:", request["content_length"])
    print("Path:", request["path"])
    print("Query:", request["query"])
    print("method", request["method"])
    print("JSONmethod", request["jsonrpc_method"])
    print("url", request["url"])

    # Return the userID if authenticated, or an empty string if not authenticated
    if request["method"] == "POST":
        return "Jesus"
    else:
        return ""
