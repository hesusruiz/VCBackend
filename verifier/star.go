// Copyright 2023 Jesus Ruiz. All rights reserved.
// Use of this source code is governed by an Apache 2.0
// license that can be found in the LICENSE file.
package verifier

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	zlog "github.com/rs/zerolog/log"
	starjson "go.starlark.net/lib/json"
	"go.starlark.net/lib/math"
	"go.starlark.net/lib/time"
	"go.starlark.net/repl"
	"go.starlark.net/starlark"
	"go.starlark.net/starlarkstruct"
)

var Module = &starlarkstruct.Module{
	Name: "star",
	Members: starlark.StringDict{
		"getbody": starlark.NewBuiltin("getbody", getRequestBody),
	},
}

func init() {

	// Set the global Starlark environment with required modules, including our own
	starlark.Universe["json"] = starjson.Module
	starlark.Universe["time"] = time.Module
	starlark.Universe["math"] = math.Module
	starlark.Universe["star"] = Module

}

// PDP implements an JSON-RPC reverse proxy
type PDP struct {

	// The globals for the Starlark program
	globals      starlark.StringDict
	thread       *starlark.Thread
	starFunction *starlark.Function

	// The name of the Starlark script file.
	scriptname string
}

func NewPDP(fileName string) (*PDP, error) {
	p := &PDP{}
	p.scriptname = fileName
	err := p.ParseAndCompileFile()
	if err != nil {
		return nil, err
	}

	return p, nil
}

func (m *PDP) ParseAndCompileFile() error {
	var err error

	// The compiled program context will be stored in a Starlark thread
	thread := &starlark.Thread{
		Load:  repl.MakeLoad(),
		Print: func(_ *starlark.Thread, msg string) { fmt.Println(msg) },
		Name:  "exec " + m.scriptname,
	}

	// Create a predeclared environment specific for this module (empy for the moment)
	predeclared := make(starlark.StringDict)

	// Parse and execute the top-level commands in the script file
	globals, err := starlark.ExecFile(thread, m.scriptname, nil, predeclared)
	if err != nil {
		zlog.Err(err).Msg("error compiling Starlark program")
		return err
	}

	// Check that we have the 'authenticate' function
	if !globals.Has("authenticate") {
		err := fmt.Errorf("missing definition of authenticate")
		zlog.Err(err).Msg("")
		return err
	}

	// Check that is is a Callable
	starFunction, ok := globals["authenticate"].(*starlark.Function)
	if !ok {
		err := fmt.Errorf("expected a Callable but got %v", globals["authenticate"].Type())
		zlog.Err(err).Str("type", globals["authenticate"].Type()).Msg("expected a Callable")
		return err
	}

	// Store in the struct for the handler
	m.thread = thread
	m.globals = globals
	m.starFunction = starFunction

	return nil

}

type jsonrpcMessage struct {
	Version string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

func (m PDP) httpHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	debug := true

	zlog.Info().Msg("in JSONRPC handler")

	// Check that this is a JSON request
	contentType := r.Header.Get("Content-Type")
	if contentType != "application/json" {
		http.Error(w, "invalid content type", http.StatusForbidden)
	}

	// Read and decode the body from the request and store in thread locals in case we need it later
	bytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	var msg jsonrpcMessage
	err = json.Unmarshal(bytes, &msg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
	if msg.Version != "2.0" {
		http.Error(w, "invalid JSON-RPC version", http.StatusBadRequest)
	}
	if len(msg.Method) == 0 {
		http.Error(w, "JSON-RPC method not specified", http.StatusBadRequest)
	}
	m.thread.SetLocal("jsonmessage", m)

	// In development, parse and compile the script on every request
	if debug {
		err := m.ParseAndCompileFile()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}

	m.thread.SetLocal("httprequest", r)

	// Create the input argument
	req, err := StarDictFromHttpRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
	req.SetKey(starlark.String("jsonrpc_method"), starlark.String(msg.Method))

	// Call the already compiled 'authenticate' funcion
	var args starlark.Tuple
	args = append(args, req)
	res, err := starlark.Call(m.thread, m.starFunction, args, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	// Check that the value returned is of the correct type
	resultType := res.Type()
	if resultType != "string" {
		err := fmt.Errorf("authenticate function returned wrong type: %v", resultType)
		zlog.Err(err).Msg("")
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	// Return the value
	user := res.(starlark.String).GoString()

	if len(user) > 0 {
		w.Write([]byte("Authenticated"))
	} else {
		w.Write([]byte("Forbidden"))
	}

}

func getRequestBody(thread *starlark.Thread, _ *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {

	// Get the current HTTP request being processed
	r := thread.Local("httprequest")
	request, ok := r.(*http.Request)
	if !ok {
		return starlark.None, fmt.Errorf("no request found in thread locals")
	}

	// Read the body from the request and store in thread locals in case we need it later
	bytes, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, err
	}
	thread.SetLocal("requestbody", bytes)

	// Resturn string for the Starlark script
	body := starlark.String(bytes)

	return body, nil
}

func StarDictFromHttpRequest(request *http.Request) (*starlark.Dict, error) {

	dd := &starlark.Dict{}

	dd.SetKey(starlark.String("method"), starlark.String(request.Method))
	dd.SetKey(starlark.String("url"), starlark.String(request.URL.String()))
	dd.SetKey(starlark.String("path"), starlark.String(request.URL.Path))
	dd.SetKey(starlark.String("query"), getDictFromValues(request.URL.Query()))

	dd.SetKey(starlark.String("host"), starlark.String(request.Host))
	dd.SetKey(starlark.String("content_length"), starlark.MakeInt(int(request.ContentLength)))
	dd.SetKey(starlark.String("headers"), getDictFromHeaders(request.Header))

	return dd, nil
}

func getDictFromValues(values map[string][]string) *starlark.Dict {
	dict := &starlark.Dict{}
	for key, values := range values {
		dict.SetKey(starlark.String(key), getSkylarkList(values))
	}
	return dict
}

func getDictFromHeaders(headers http.Header) *starlark.Dict {
	dict := &starlark.Dict{}
	for key, values := range headers {
		dict.SetKey(starlark.String(key), getSkylarkList(values))
	}
	return dict
}

func getSkylarkList(values []string) *starlark.List {
	list := &starlark.List{}
	for _, v := range values {
		list.Append(starlark.String(v))
	}
	return list
}
