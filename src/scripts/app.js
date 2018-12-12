import SideBar from './sidebar';
import StatusBar from './statusbar';
import Cover from './cover';
import PageContent from './pagecontent';

export default class DigiBook extends H5P.EventDispatcher {
  /**
   * @constructor
   *
   * @param {object} config
   * @param {string} contentId
   * @param {object} contentData
   */
  constructor(config, contentId, contentData = {}) {
    super();
    const self = this;
    this.contentId = contentId;
    this.activeChapter = 0;
    this.newHandler = {};

    this.params = config;
    this.params.behaviour = this.params.behaviour || {};

    /*
     * this.params.behaviour.enableSolutionsButton and this.params.behaviour.enableRetry
     * are used by H5P's question type contract.
     * @see {@link https://h5p.org/documentation/developers/contracts#guides-header-8}
     * @see {@link https://h5p.org/documentation/developers/contracts#guides-header-9}
     */
    this.params.behaviour.enableSolutionsButton = false;
    this.params.behaviour.enableRetry = false;

    this.animationInProgress = false;

    /**
     * Check if result has been submitted or input has been given.
     *
     * @return {boolean} True, if answer was given.
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-1}
     */
    this.getAnswerGiven = () => this.chapters.reduce((accu, current) => {
      if (typeof current.instance.getAnswerGiven === 'function') {
        return accu && current.instance.getAnswerGiven();
      }
      return accu;
    }, true);

    /**
     * Get latest score.
     *
     * @return {number} Latest score.
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-2}
     */
    this.getScore = () => this.chapters.reduce((accu, current) => {
      if (typeof current.instance.getScore === 'function') {
        return accu + current.instance.getScore();
      }
      return accu;
    }, 0);

    /**
     * Get maximum possible score.
     *
     * @return {number} Score necessary for mastering.
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-3}
     */
    this.getMaxScore = () => this.chapters.reduce((accu, current) => {
      if (typeof current.instance.getMaxScore === 'function') {
        return accu + current.instance.getMaxScore();
      }
      return accu;
    }, 0);

    /**
     * Show solutions.
     *
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-4}
     */
    this.showSolutions = () => {
      this.chapters.forEach(chapter => {
        if (typeof chapter.instance.toggleReadSpeaker === 'function') {
          chapter.instance.toggleReadSpeaker(true);
        }
        if (typeof chapter.instance.showSolutions === 'function') {
          chapter.instance.showSolutions();
        }
        if (typeof chapter.instance.toggleReadSpeaker === 'function') {
          chapter.instance.toggleReadSpeaker(false);
        }
      });
    };

    /**
     * Reset task.
     *
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-5}
     */
    this.resetTask = () => {
      this.chapters.forEach(chapter => {
        if (typeof chapter.instance.resetTask === 'function') {
          chapter.instance.resetTask();
        }
      });

      this.sideBar.resetIndicators();
    };

    /**
     * Get xAPI data.
     *
     * @return {Object} xAPI statement.
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
     */
    this.getXAPIData = () => {
      const xAPIEvent = this.createXAPIEventTemplate('answered');
      this.addQuestionToXAPI(xAPIEvent);
      xAPIEvent.setScoredResult(this.getScore(),
        this.getMaxScore(),
        this,
        true,
        this.getScore() === this.getMaxScore()
      );

      return {
        statement: xAPIEvent.data.statement,
        children: this.getXAPIDataFromChildren(this.chapters.map(chapter => chapter.instance))
      };
    };

    /**
     * Get xAPI data from sub content types.
     *
     * @param {Object[]} instances H5P instances.
     * @return {Object[]} xAPI data objects used to build a report.
     */
    this.getXAPIDataFromChildren = instances => {
      return instances.map(instance => {
        if (typeof instance.getXAPIData === 'function') {
          return instance.getXAPIData();
        }
      }).filter(data => !!data);
    };

    /**
     * Add question itself to the definition part of an xAPIEvent.
     *
     * @param {H5P.XAPIEvent} xAPIEvent.
     */
    this.addQuestionToXAPI = xAPIEvent => {
      const definition = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
      H5P.jQuery.extend(definition, this.getxAPIDefinition());
    };

    /**
     * Generate xAPI object definition used in xAPI statements.
     *
     * @return {Object} xAPI definition.
     */
    this.getxAPIDefinition = () => ({
      interactionType: 'compound',
      type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
      description: {'en-US': ''}
    });

    this.doesCoverExist = () => {
      if (this.cover && this.cover.div) {
        return true;
      }
      return false;
    };


    this.getActiveChapter = () => {
      return this.activeChapter;
    };

    this.setActiveChapter = (input) => {
      const number = parseInt(input);
      if (!isNaN(number)) {
        this.activeChapter = parseInt(input);
      }
    };

    this.retrieveHashFromUrl = () => {
      const rawparams = top.location.hash.replace('#', "").split('&').map(el => el.split("="));
      const redirObj = {};

      //Split up the hash parametres and assign to an object
      rawparams.forEach(argPair => {
        redirObj[argPair[0]] = argPair[1];
      });

      if (redirObj.h5pbookid == self.contentId && redirObj.chapter) {
        if (!redirObj.chapter) {
          return;
        }
      }
      return redirObj;
    };

    /**
     * Compare the current hash with the currently redirected hash.
     *
     * Used for checking if the user attempts to redirect to the same section twice
     * @param {object} hashObj - the object that should be compared to the hash
     * @param {String} hashObj.chapter
     * @param {String} hashObj.section
     * @param {number} hashObj.h5pbookid
     */
    this.isCurrentHashSameAsRedirect = (hashObj) => {
      const temp = this.retrieveHashFromUrl();
      for (const key in temp) {
        if (temp.hasOwnProperty(key)) {
          const element = temp[key];
          if (element != hashObj[key]) {
            return false;
          }
        }
      }
      return true;
    };

    /**
     * Establish all triggers
     */
    this.on('toggleMenu', () => {
      this.sideBar.div.classList.toggle('h5p-digibook-hide');
    });

    this.on('scrollToTop', () => {
      this.statusBar.header.scrollIntoView(true);
    });

    /**
     *
     */
    this.on('newChapter', (event) => {
      if (this.animationInProgress) {
        return;
      }
      this.newHandler = event.data;

      //Assert that the module itself is asking for a redirect
      this.newHandler.redirectFromComponent = true;
      // Create the new hash
      const idString = 'h5pbookid=' + this.newHandler.h5pbookid;
      const chapterString = '&chapter=' + this.newHandler.chapter;
      let sectionString = "";
      if (this.newHandler.section !== undefined) {
        sectionString = '&section=' + this.newHandler.section;
      }
      event.data.newHash = "#" + idString + chapterString + sectionString;

      if (event.data.chapter === this.activeChapter) {
        if (this.isCurrentHashSameAsRedirect(event.data)) {
          //only trigger section redirect without changing hash
          this.pageContent.changeChapter(false, event.data);
          return;
        }
      }
      H5P.trigger(this, "changeHash", event.data);
    });

    /**
     * Check if the current chapter is read
     *
     * @returns {boolean}
     */
    this.isCurrentChapterRead = () => {
      return this.chapters[this.activeChapter].completed;
    };

    /**
     * Set the current chapter as completed
     */
    this.setCurrentChapterRead = () => {
      this.chapters[this.activeChapter].completed = true;
      this.sideBar.setChapterIndicatorComplete(this.activeChapter);
    };

    /**
     * Update statistics on the main chapter
     *
     * @param {number} targetChapter
     * @param {boolean} hasChangedChapter
     */
    this.updateChapterProgress = function (targetChapter, hasChangedChapter = false) {
      if (!this.params.behaviour.progressIndicators || !this.params.behaviour.progressAuto) {
        return;
      }
      const chapter = this.chapters[targetChapter];
      let status;
      if (chapter.maxTasks) {
        if (chapter.tasksLeft === chapter.maxTasks) {
          status = 'BLANK';
        }
        else if (chapter.tasksLeft === 0) {
          status = 'DONE';
        }
        else {
          status = 'STARTED';
        }
      }
      else if (chapter.maxTasks === 0) {
        if (hasChangedChapter) {
          status = 'DONE';
        }
        else {
          status = 'BLANK';
        }
      }
      else {
        status = 'DONE';
      }

      if (status === 'DONE') {
        chapter.instance.triggerXAPIScored(chapter.instance.getScore(), chapter.instance.getMaxScore(), 'completed');
      }
      this.sideBar.updateChapterProgressIndicator(targetChapter, status);
    };

    /**
     * Check if the content height exceeds the window
     * @param {div} chapterHeight
     */
    this.shouldFooterBeVisible = (chapterHeight) => {
      return chapterHeight <= window.outerHeight;
    };

    /**
     * Change the current active chapter
     * @param {boolean} redirectOnLoad - Is this a redirect which happens immediately?
     */
    this.changeChapter = (redirectOnLoad) => {
      this.pageContent.changeChapter(redirectOnLoad, this.newHandler);
      this.statusBar.updateStatusBar();
      this.newHandler.redirectFromComponent = false;
    };


    /**
     * Triggers whenever the hash changes, indicating that a chapter redirect is happening
     */
    H5P.on(this, 'respondChangeHash', () => {
      const payload = self.retrieveHashFromUrl(top.location.hash);
      if (payload.h5pbookid && parseInt(payload.h5pbookid) === self.contentId) {
        this.redirectChapter(payload);
      }
    });

    H5P.on(this, 'changeHash', function (event) {
      if (event.data.h5pbookid === this.contentId) {
        top.location.hash = event.data.newHash;
      }
    });

    H5P.externalDispatcher.on('xAPI', function (event) {
      if (event.getVerb() === 'answered' || event.getVerb() === 'completed') {
        if (self.params.behaviour.progressIndicators) {
          self.setSectionStatusByID(this.subContentId || this.contentData.subContentId, self.activeChapter);
        }
      }
    });

    this.redirectChapter = function (event) {
      /**
       * If true, we already have information regarding redirect in newHandler
       * When using browser history, a convert is neccecary
       */
      if (!this.newHandler.redirectFromComponent) {
        let tmpEvent;
        tmpEvent = event;
        // Assert that the handler actually is from this content type.
        if (tmpEvent.h5pbookid && parseInt(tmpEvent.h5pbookid) === self.contentId) {
          self.newHandler = tmpEvent;
        /**
         * H5p-context switch on no newhash = history backwards
         * Redirect to first chapter
         */
        }
        else {
          self.newHandler = {
            chapter: self.chapters[0].instance.subContentId,
            h5pbookid: self.h5pbookid
          };
        }
      }
      self.changeChapter(false);
    };

    /**
     * Set a section progress indicator
     *
     * @param {string} targetId
     * @param {string} targetChapter
     */
    this.setSectionStatusByID = function (targetId, targetChapter) {
      for (let i = 0; i < this.chapters[targetChapter].sectionInstances.length; i++) {
        const element = this.chapters[targetChapter].sectionInstances[i];
        if (element.subContentId === targetId && !element.taskDone) {
          element.taskDone = true;
          this.sideBar.setSectionMarker(targetChapter, i);
          this.chapters[targetChapter].tasksLeft -= 1;
          if (this.params.behaviour.progressAuto) {
            this.updateChapterProgress(targetChapter);
          }
        }
      }
    };

    top.addEventListener('hashchange', (event) => {
      H5P.trigger(this, 'respondChangeHash', event);
    });

    /**
     * Attach library to wrapper
     * @param {jQuery} $wrapper
     */
    this.attach = function ($wrapper) {
      $wrapper[0].classList.add('h5p-scrollable-fullscreen');
      // Needed to enable scrolling in fullscreen
      $wrapper[0].id = "h5p-digibook";
      if (this.cover) {
        $wrapper.get(0).appendChild(this.cover.div);
      }
      $wrapper.get(0).appendChild(this.statusBar.header);

      const first = this.pageContent.div.firstChild;
      if (first) {
        this.pageContent.div.insertBefore(this.sideBar.div, first);
      }

      $wrapper.get(0).appendChild(this.pageContent.div);
      $wrapper.get(0).appendChild(this.statusBar.footer);
    };

    this.hideAllElements = function (hideElements) {

      const targetElements = [
        this.statusBar.header,
        this.statusBar.footer,
        this.pageContent.div
      ];

      if (hideElements) {
        targetElements.forEach(x => {
          x.classList.add('h5p-content-hidden');
          x.classList.add('digibook-cover-present');
        });
      }

      else {
        targetElements.forEach(x => {
          x.classList.remove('h5p-content-hidden');
          x.classList.remove('digibook-cover-present');
        });
      }
    };

    //Initialize the support components
    if (config.showCoverPage) {
      this.cover = new Cover(config.bookCover, contentData.metadata.title, config.read, contentId, this);
    }

    this.pageContent = new PageContent(config, contentId, contentData, this, {
      l10n: {
        markAsFinished: config.markAsFinished
      },
      behaviour: this.params.behaviour
    });
    this.chapters = this.pageContent.getChapters();

    this.sideBar = new SideBar(config, contentId, contentData.metadata.title, this);

    this.statusBar = new StatusBar(contentId, config.chapters.length, this, {
      l10n: {
        nextPage: config.nextPage,
        previousPage: config.previousPage,
        navigateToTop: config.navigateToTop
      },
      behaviour: this.params.behaviour
    });

    if (this.doesCoverExist()) {

      this.hideAllElements(true);

      this.on('coverRemoved', () => {
        this.hideAllElements(false);
        this.trigger('resize');
      });
    }

    //Kickstart the statusbar
    this.statusBar.updateStatusBar();
    this.pageContent.updateFooter();
  }
}
