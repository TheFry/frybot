local response = {}
response[1] = redis.pcall('JSON.SET', KEYS[2], '.', ARGV[2])

if response[1]['err'] ~= nil then
  redis.log(redis.LOG_WARNING, response[1]['err'])
  redis.debug(redis.LOG_WARNING, response[1]['err'])
  response[2] = 0
  return response
end

local cmd = "LPUSH"
if ARGV[3] == "true" then
  cmd = "RPUSH"
end

response[2] = redis.pcall(cmd, KEYS[1], ARGV[1])
local isTableError = type(response[2]) == "table" and response[2]['err'] ~= nil
if isTableError or response[2] <= 0 then
  redis.log(redis.LOG_WARNING, response[2]['err'])
  redis.debug(redis.LOG_WARNING, response[2]['err'])
  redis.pcall('del', KEYS[2])
end

return response