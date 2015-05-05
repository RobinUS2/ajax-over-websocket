// Websocket servers that bundles requests to localhost
// @author Robin Verlangen

package main

import (
	"golang.org/x/net/websocket"
	"io"
	"log"
	"net/http"
)

// Echo the data received on the WebSocket.
func EchoServer(ws *websocket.Conn) {
	io.Copy(ws, ws)
}

// This example demonstrates a trivial echo server.
func main() {
	log.Println("Starting")
	http.Handle("/echo", websocket.Handler(EchoServer))
	err := http.ListenAndServe(":12345", nil)
	if err != nil {
		panic("ListenAndServe: " + err.Error())
	}
	log.Println("Shutting down")
}
