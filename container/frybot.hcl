job "frybot" {
  datacenters = ["local"]
  type = "service"

  group "frybot" {
    count = 1

    network {
      dns {
        servers = [""]
      }
    }

    restart {
      attempts = 3
    }

    task "interaction-processor" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/frybot"
        args = [ "built/cmd_processor/main.js" ]
      }

      env {
        DEPLOY = 1
        // DEBUG = 1
        REDIS_URL = "redis://redis.service.consul:6379"
        LOG_LEVEL = 3
      }

      resources {
        cpu = "500"
        memory = "128"
      }

      vault {
        policies = ["default", "sassy-bot"]
      }

      template {
        data = <<EOF
        DC_TOKEN={{with secret "secret/data/discord/frybot"}}{{.Data.data.DC_TOKEN}}{{end}}
        DC_CLIENT={{with secret "secret/data/discord/frybot"}}{{.Data.data.DC_CLIENT}}{{end}}
        YT_TOKEN={{with secret "secret/data/discord/frybot"}}{{.Data.data.YT_TOKEN}}{{end}}
        G_ID={{with secret "secret/data/discord/frybot"}}{{.Data.data.G_ID}}{{end}}
        EOF
        env = true
        destination = "secrets/env"
      }
      
      volume_mount {
        volume      = "frybot_media"
        destination = "/frybot_media"
        read_only   = false
      }
    }

    task "voicebot1" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/frybot"
        args = [ "built/voice_bot/main.js" ]
      }

      env {
        REDIS_URL = "redis://redis.service.consul:6379"
        LOG_LEVEL = 3
      }

      resources {
        cpu = "500"
        memory = "128"
      }

      vault {
        policies = ["default", "sassy-bot"]
      }

      template {
        data = <<EOF
        DC_TOKEN={{with secret "secret/data/discord/voicebot1"}}{{.Data.data.DC_TOKEN}}{{end}}
        YT_TOKEN={{with secret "secret/data/discord/voicebot1"}}{{.Data.data.YT_TOKEN}}{{end}}
        EOF
        env = true
        destination = "secrets/env"
      }
    }
    
    task "voicebot2" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/frybot"
        args = [ "built/voice_bot/main.js" ]
      }

      env {
        REDIS_URL = "redis://redis.service.consul:6379"
        LOG_LEVEL = 3
      }

      resources {
        cpu = "500"
        memory = "128"
      }

      vault {
        policies = ["default", "sassy-bot"]
      }

      template {
        data = <<EOF
        DC_TOKEN={{with secret "secret/data/discord/voicebot2"}}{{.Data.data.DC_TOKEN}}{{end}}
        YT_TOKEN={{with secret "secret/data/discord/voicebot2"}}{{.Data.data.YT_TOKEN}}{{end}}
        EOF
        env = true
        destination = "secrets/env"
      }
    }

    task "voicebot3" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/frybot"
        args = [ "built/voice_bot/main.js" ]
      }

      env {
        REDIS_URL = "redis://redis.service.consul:6379"
        LOG_LEVEL = 3
      }

      resources {
        cpu = "500"
        memory = "128"
      }

      vault {
        policies = ["default", "sassy-bot"]
      }

      template {
        data = <<EOF
        DC_TOKEN={{with secret "secret/data/discord/voicebot3"}}{{.Data.data.DC_TOKEN}}{{end}}
        YT_TOKEN={{with secret "secret/data/discord/voicebot3"}}{{.Data.data.YT_TOKEN}}{{end}}
        EOF
        env = true
        destination = "secrets/env"
      }
    }

    task "ffmpeg" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/frybot"
        args = [ "built/ffmpeg/main.js" ]
      }

      env {
        REDIS_URL = "redis://redis.service.consul:6379"
        LOG_LEVEL = 3
      }

      resources {
        cpu = "500"
        memory = "512"
      }

      volume_mount {
        volume      = "frybot_media"
        destination = "/frybot_media"
        read_only   = false
      }
    }

    volume "frybot_media" {
      type = "host"
      read_only = "false"
      source = "frybot_media"
    }
  }

}                                                                                                                                                                                                                                
