job "frybot" {
  datacenters = ["local"]
  type = "service"

  group "frybot" {
    count = 1

    restart {
      attempts = 1
    }

    task "frybot" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/frybot:latest"
      }

      env {
        DEPLOY = 1
      }

      resources {
        cpu = "500"
        memory = "512"
      }

      vault {
        policies = ["default", "sassy-bot"]
      }

      service {
        name = "frybot"
        tags = [
          "urlprefix-frybot.service.consul/",
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
        DC_TOKEN={{with secret "secret/data/frybot"}}{{.Data.data.DC_TOKEN}}{{end}}
        DC_CLIENT={{with secret "secret/data/frybot"}}{{.Data.data.DC_CLIENT}}{{end}}
        YT_TOKEN={{with secret "secret/data/frybot"}}{{.Data.data.YT_TOKEN}}{{end}}
        G_ID={{with secret "secret/data/frybot"}}{{.Data.data.G_ID}}{{end}}
        EOF
        env = true
        destination = "secrets/env"
      }
    }
  }
}                                                                                                                                                                                                                                