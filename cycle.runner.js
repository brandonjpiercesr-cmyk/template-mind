// ⬡B:cycle.runner:WONDER:signal_driven_default_off_cycle_service:20260725⬡
'use strict';

// This service owns no paid cadence. When explicitly enabled, it performs a bounded cheap
// poll for an exact-HAM AUTONOMOUS_CYCLE_SIGNAL. The controller proves a durable claim and
// consumption receipt before any PAI, SPAN, drain, or proactive station can run. With no
// signal, an unreadable brain, or missing configuration, the service spends nothing.

const express = require('express');
const autonomous = require('./pai/core/autonomous.cycle.js');

function createService(options) {
  options = options || {};
  const env = options.env || process.env;
  const logger = options.log || console.log;
  const controller = options.controller || autonomous.createController({
    env: env,
    log: logger
  });
  const app = express();
  let timer = null;
  let server = null;

  app.get('/health', function (req, res) {
    res.json(controller.health());
  });

  function start() {
    const port = Number.parseInt(env.PORT || '10000', 10);
    server = app.listen(port, function () {
      const health = controller.health();
      logger('[cycle.runner] up on ' + port + ' mode=signal_driven enabled=' + health.enabled +
        ' born=' + health.born + ' poll_ms=' + (health.poll_interval_ms || 0));
      if (!health.enabled || !health.born) return;
      // The first poll can only spend when a pre-existing governed signal is consumed.
      controller.poll().catch(function (error) {
        logger('[cycle.runner] initial zero-spend poll failed: ' + error.message);
      });
      timer = setInterval(function () {
        controller.poll().catch(function (error) {
          logger('[cycle.runner] zero-spend poll failed: ' + error.message);
        });
      }, health.poll_interval_ms);
    });
    return server;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!server) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      server.close(function (error) {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  return { app: app, controller: controller, start: start, stop: stop };
}

if (require.main === module) createService().start();

module.exports = { createService: createService };
