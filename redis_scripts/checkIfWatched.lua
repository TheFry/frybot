local isReserved = redis.call("SISMEMBER", KEYS[1], ARGV[1])
if isReserved == 0 then
  redis.call("LPUSH", KEYS[2], ARGV[1])
end