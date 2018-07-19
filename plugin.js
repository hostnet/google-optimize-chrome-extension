// Whenever the user switches a tab / navigates to another site, we check if the Google Optimize cookie is present on
// the domain. Once the cookie is found, we spin up the plugin functionality that lets the user alter the cookie.
chrome.tabs.getSelected(null, function (tab) {
    chrome.cookies.get({url: tab.url, name: '_gaexp'}, (optimizeCookie) => {
        if (optimizeCookie) {
            new GoogleOptimize(tab.url, optimizeCookie, tab);
        }
    });
});

/**
 * Generates a random UUID v4 string
 * https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
 *
 * @returns {string}
 */
function uuidv4 ()
{
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Keeps track of experiment aliases. The experiment ID's from Google Optimize are "random" strings that don't say much.
 * This will allow the user to assign a 'human readable name' to the experiment.
 */
const aliasDictionary = {};

class GoogleOptimize
{
    /**
     * @param {String} url
     * @param {String} cookieData
     * @param {Tab}    activeTab
     */
    constructor (url, cookie, activeTab)
    {
        this.url         = url;
        this.cookie      = cookie;
        this.activeTab   = activeTab;
        this.experiments = {};

        this._prepareAliasDictionary();
        this._renderInterface(cookie.value);
    }

    /**
     * Populates the local "aliasDictionary" object with previously stored aliases from the local storage.
     *
     * @private
     */
    _prepareAliasDictionary()
    {
        chrome.storage.local.get('aliases', (e) => {
            Object.keys(e.aliases).forEach((key) => aliasDictionary[key] = e.aliases[key]);
        });
    }

    /**
     * Parses cookie data into Experiment instances and renders the interface.
     *
     * @param {String} data
     * @private
     */
    _renderInterface (data)
    {
        let regExp = /([a-zA-Z0-9-]+)\.(\d+)\.(\d+)/gim,
            match;

        while (match = regExp.exec(data)) {
            if (match.length === 4) {
                this.experiments[match[1]] = new Experiment(match[1], match[2], match[3]);
                this.experiments[match[1]].renderForm(document.querySelector('#experiments'));
            }
        }

        // Render the "add new" row.
        this._renderEmptyRow();

        // Apply button listeners.
        document.querySelector('#save-button').addEventListener('click', () => this._saveAndReload());
        document.querySelector('#reload-button').addEventListener('click', () => window.location.reload(true));

        // Garbage collect old aliases.
        setTimeout(() => {
            Object.keys(aliasDictionary).forEach((id) => {
                if (typeof this.experiments[id] === 'undefined') {
                    delete aliasDictionary[id];
                }
            });
            chrome.storage.local.set({aliases: aliasDictionary});
        }, 250);
    }

    /**
     * Renders an empty row that may be used to add a new experiment to the cookie.
     *
     * @private
     */
    _renderEmptyRow ()
    {
        let expiry            = Math.floor(new Date() / 8.64e7) + 90; // Epoch + 90 days.
        this.experiments['*'] = new Experiment('', expiry, 0);
        this.experiments['*'].renderForm(document.querySelector('#experiments'));
    }

    /**
     * Save changes to the _gaexp cookie and reload the active tab.
     *
     * @private
     */
    _saveAndReload ()
    {
        let experimentsData = [];
        Object.values(this.experiments).forEach((experiment) => {
            if (experiment.id === '') {
                return;
            }
            experimentsData.push(experiment.getDataString());
        });

        chrome.cookies.set({
            url:    this.url,
            name:   this.cookie.name,
            domain: this.cookie.domain,
            path:   this.cookie.path,
            secure: this.cookie.secure,
            value:  'GAX1.2.' + experimentsData.join('!')
        }, (cookie) => {
            if (cookie) {
                // Reload tab & popup.
                chrome.tabs.reload(this.activeTab.id);
                window.location.reload(true);
            } else {
                alert(chrome.runtime.lastError);
            }
        });
    }
}

class Experiment
{
    constructor (id, expiry, flowId)
    {
        this.rowId  = 'gaexp-' + uuidv4();
        this.id     = id;
        this.expiry = expiry;
        this.flowId = flowId;
        this.alias  = '';
    }

    /**
     * Returns the data string that is used in the cookie for this experiment.
     *
     * @returns {String}
     */
    getDataString ()
    {
        return [this.id, this.expiry, this.flowId].join('.');
    }

    /**
     * Renders the form for this experiment.
     * @param targetElement
     */
    renderForm (targetElement)
    {
        targetElement.innerHTML += `
            <tr data-id="${this.id}" id="${this.rowId}">
                <td><input type="text" class="form-control input-alias" value="${this.alias}" placeholder="Experiment alias"></td>
                <td><input type="text" class="form-control input-id" value="${this.id}"></td>
                <td><input type="number" class="form-control input-expiry" value="${this.expiry}" min="0" max="99999"></td>
                <td><input type="number" class="form-control input-flow-id" value="${this.flowId}" min="0" max="1000"></td>
                <td><button class="btn btn-default"><i class="icon icon-trash"></i></button></td>
            </tr>
        `;

        // Bind events on next draw call.
        requestAnimationFrame(() => {
            console.log('now!', aliasDictionary);
            this._updateValue('.input-alias', aliasDictionary[this.id] || '');
            this._bindEvents();
        });
    }

    /**
     * Executes the given callback when a form control that matches the given querySelector changed its input value.
     *
     * @param {String}   querySelector
     * @param {Function} callback
     * @private
     */
    _addChangeListener (querySelector, callback)
    {
        document
            .querySelector('#' + this.rowId + ' ' + querySelector)
            .addEventListener('change', (e) => callback(e.target.value));
    }

    /**
     * Sets the value attribute of an element that matches the given querySelector.
     *
     * @param {String}        querySelector
     * @param {String|Number} value
     * @private
     */
    _updateValue (querySelector, value)
    {
        document
            .querySelector('#' + this.rowId + ' ' + querySelector)
            .setAttribute('value', value);
    }

    /**
     * Bind change events to the elements for this experiments.
     *
     * @private
     */
    _bindEvents ()
    {
        this._addChangeListener('.input-expiry', (value) => this.expiry = value);
        this._addChangeListener('.input-flow-id', (value) => this.flowId = value);
        this._addChangeListener('.input-id', (value) => this._setId(value));
        this._addChangeListener('.input-alias', (value) => this._setAlias(value));

        document.querySelector('#' + this.rowId + ' .btn').addEventListener('click', () => {
            this._setId('');
        });
    }

    /**
     * Store the alias of this experiment. Since this name is not part of the cookie, we'll have to store this
     * separately in local storage.
     *
     * @param {String} value
     * @private
     */
    _setAlias (value)
    {
        this.alias               = value;
        aliasDictionary[this.id] = value;
        chrome.storage.local.set({aliases: aliasDictionary});
    }

    /**
     * Sets the ID of this experiment.
     * If the ID is an empty string, the experiment is removed.
     *
     * @param {String} value
     * @private
     */
    _setId (value)
    {
        // Nothing has changed.
        if (this.id === value) {
            return;
        }

        if (value === '') {
            // Delete the experiment.
            let row = document.querySelector('#' + this.rowId);
            this.id = ''; // Emptying the string will ensure that the data is not used in the cookie.
            row.parentNode.removeChild(row);
            delete aliasDictionary[this.id];
            chrome.storage.local.set({aliases: aliasDictionary});
            return;
        }

        // Update local storage.
        aliasDictionary[value] = aliasDictionary[this.id];
        delete aliasDictionary[this.id];
        chrome.storage.local.set({aliases: aliasDictionary});

        this.id = value;
    }
}

// "Powered by" footer.
document.querySelector('.copyright-footer a').addEventListener('click', () => {
    chrome.tabs.create({url: 'https://www.hostnet.nl/'});
});
