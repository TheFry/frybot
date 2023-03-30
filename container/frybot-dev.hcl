job "frybot-dev" {
  datacenters = ["local"]
  type = "service"

  group "frybot-dev" {
    count = 1

    restart {
      attempts = 1
    }

    task "frybot-dev" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/frybot:dev"
      }

      env {
        DEPLOY = 1
        DEBUG = 1
      }

      resources {
        cpu = "500"
        memory = "128"
      }

      vault {
        policies = ["default", "sassy-bot"]
      }

      service {
        name = "frybot-dev"
        tags = [
          "urlprefix-frybot-dev.service.consul/",
        ]

        check {
          type = "script"
          command = "echo"
          args = ["check"]
          interval = "3s"
          timeout = "5s"
        }
      }

      template {
        data = <<EOF
        DC_TOKEN={{with secret "secret/data/discord/frybot"}}{{.Data.data.DEV_DC_TOKEN}}{{end}}
        DC_CLIENT={{with secret "secret/data/discord/frybot"}}{{.Data.data.DEV_DC_CLIENT}}{{end}}
        YT_TOKEN={{with secret "secret/data/discord/frybot"}}{{.Data.data.YT_TOKEN}}{{end}}
        G_ID={{with secret "secret/data/discord/frybot"}}{{.Data.data.G_ID}}{{end}}
        EOF
        env = true
        destination = "secrets/env"
      }
    }
  }
}                                                                                                                                                                                                                                