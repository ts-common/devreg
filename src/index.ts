import * as http from "http"

console.log("starting the server...")

http.createServer((request, response) => {
  console.log(request)
  response.end()
}).listen(8000)

console.log("started.")