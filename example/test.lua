os.loadAPI("json") -- http://pastebin.com/4nRg9CHU
local _url = "ws://ip:64641"
local ws = http.websocketAsync(_url)
local addr = "kfmcu3yb4a" -- change this address
function resp(type, obj)
  local tb = {
    t = type,
    p = obj
  }
  return json.encode(tb)
end
while true do
  local event, url, contents = os.pullEvent()
  if url == _url then
    if event == "websocket_success" then
      print("Connected ")
      ws = contents
    elseif event == "websocket_failure" then
      printError("Websocket failed to connect or connection dropped")
    elseif event == "websocket_message" then
      local obj = json.decode(contents)
      if obj.t == "HELLO" then
        local p = {address = addr}
        ws.send(resp("AUTH", p))
      elseif obj.t == "AUTH" then
        print("Awaiting transaction to "..obj.p.address)
        print("Send "..obj.p.amount.." KST to the address and it will be refunded")
      elseif obj.t == "WELCOME" then
        print("Authorized! "..obj.p.balance.." KST in the account")
      end  
    end
  end
end