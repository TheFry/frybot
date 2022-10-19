job "sassy-bot" {
  datacenters = ["local"]
  type = "service"

  group "sassy-bot" {
    count = 1

    restart {
      attempts = 1
    }

    task "sassy-bot" {
      driver = "docker"

      config {
        image = "docker-reg.service.consul:5000/sassy-bot:latest"
      }

      env {
        // DEPLOY = 1
      }

      resources {
        cpu = "500"
        memory = "128"
      }

      vault {
        policies = ["default", "sassy-bot"]
      }

      service {
        name = "sassy-bot"
        tags = [
          "urlprefix-sassy-bot.service.consul/",
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
        DC_TOKEN={{with secret "secret/data/sassy-bot"}}{{.Data.data.DC_TOKEN}}{{end}}
        DC_CLIENT={{with secret "secret/data/sassy-bot"}}{{.Data.data.DC_CLIENT}}{{end}}
        YT_TOKEN={{with secret "secret/data/sassy-bot"}}{{.Data.data.YT_TOKEN}}{{end}}
        G_ID={{with secret "secret/data/sassy-bot"}}{{.Data.data.G_ID}}{{end}}
        EOF
        env = true
        destination = "secrets/env"
      }
    }
  }
}                                                                                                                                                                                                                                
